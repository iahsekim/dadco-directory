/**
 * Dad & Co — meetup directory backend (Google Apps Script + Google Sheets)
 *
 * Profiles are opt-in. Until someone claims theirs, the public page shows only their name
 * and a "Claim profile" button. Claims and edits publish right away; each one is logged in the
 * Pending tab (status "published") with the previous version, so you can undo it from #admin.
 *
 * Sheets it manages:
 *   Directory — one row per attendee. Put each person's RSVP email in the "email" column.
 *               claimed = TRUE once you approve their claim. hidden = TRUE removes them entirely.
 *   Pending   — submitted claims/edits waiting for approval, plus backups of cleared profiles.
 *   Events    — each Luma guest list you've imported. The newest import is the current event.
 *   RSVPs     — who was on each event's guest list. Only the current event's guests are shown;
 *               everyone else stays in Directory (profiles are kept) but is hidden from the page.
 *
 * Setup: bind this script to a new Google Sheet (Extensions → Apps Script), paste this file,
 * run setup() once (it seeds the Directory and logs your admin key), then
 * Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 */

const SHEET_ID = '';          // leave blank when the script is bound to the Sheet
const ADMIN_EMAIL = '';       // optional: get an email whenever someone submits a claim or edit
const EVENT_NAME = 'Dad & Co';
const DIR = 'Directory';
const PENDING = 'Pending';
// kids column: comma-separated "age girl|boy", e.g. "7 girl, 11 girl" or "? boy" when the age is unknown.
// links column: one per line, "type: value" — types: instagram, twitter, website, phone, email, other.
const COLS = ['id', 'email', 'name', 'kids', 'home', 'askHome', 'company', 'work', 'askWork', 'links', 'claimed', 'hidden', 'updatedAt'];
const PCOLS = ['submissionId', 'entryId', 'email', 'submittedAt', 'status', 'data'];
const EVENTS = 'Events';
const RSVPS = 'RSVPs';
const ECOLS = ['eventId', 'name', 'url', 'date', 'importedAt', 'guests'];
const RCOLS = ['eventId', 'entryId', 'email', 'name', 'status'];
const LINK_TYPES = ['instagram', 'twitter', 'website', 'phone', 'email', 'other'];

const SEED = [{"id": "ben-lozano", "name": "Ben Lozano", "kids": [{"age": 7, "is": "girl"}, {"age": 11, "is": "girl"}], "company": "Level Up Leak Detection (Denver franchise)", "home": "Still finds time for cheer, dance, parks, and picnics with his two girls.", "askHome": ["Raising girls who are apparently already teenagers"], "work": "Ben is an entrepreneur in the outdoor home-services world, working across pool and spa leak detection, decks, motorized shades, and custom aluminum pergolas. He owns the Denver **Level Up Leak Detection** franchise.", "askWork": ["Building a service business", "Pool leaks", "Franchising"]}, {"id": "bryan-fillmer", "name": "Bryan Fillmer", "kids": [{"age": 21, "is": "boy"}, {"age": 15, "is": "boy"}], "company": "Fillmer Innovation Group", "home": "Gym rat, fisherman, and dad to two boys, 21 and 15.", "askHome": ["Raising teenage and adult boys", "Fishing", "Workouts"], "work": "Bryan owns **Fillmer Innovation Group**, where he helps companies figure out what should be automated, what AI should handle, and what should stay human. He’s also an investor, longtime technologist, and product builder.", "askWork": ["Practical AI", "Investing"]}, {"id": "cody-caplinger", "name": "Cody Caplinger", "kids": [], "company": "Somata Peptides", "home": "", "askHome": [], "work": "Cody is a longtime entrepreneur and sales operator who previously built and led Klick Solar into an eight-figure sales organization. He’s also worked in fintech and capital markets and is now building **Somata Peptides** in the health and performance space.", "askWork": ["Building sales teams", "Scaling companies", "Peptides & performance", "Going from operator to founder"]}, {"id": "dave-ambrose", "name": "Dave Ambrose", "kids": [{"age": 8, "is": "girl"}], "company": "Community Clay", "home": "Dad to an 8-year-old daughter. Runs the family business alongside his wife, and plays in a band called **The Disasters**.", "askHome": ["Running a business with your wife", "Playing in a band"], "work": "Dave left a 20+ year career in tech and project management to join his wife in building **Community Clay**, which grew from her pottery side hustle into a two-location Denver family business. He handles much of the behind-the-scenes operation, from HR and payroll to carpentry and plumbing.", "askWork": ["Leaving corporate life", "Pottery studios"]}, {"id": "eric-gonzalez", "name": "Eric Gonzalez", "kids": [{"age": 3, "is": ""}, {"age": 1, "is": ""}], "company": "Omnificity", "home": "Recently moved the family to the Denver/Boulder area, with a 3-year-old and a 1-year-old in tow.", "askHome": ["Moving to Colorado", "Life with two little kids"], "work": "Eric runs **Omnificity** and works as a fractional data and AI executive, helping companies turn complicated technology and analytics into practical business decisions. He recently made the full-time jump into entrepreneurship.", "askWork": ["Making AI actually useful to a business", "Leaving a full-time role"]}, {"id": "greg-narain", "name": "Gregarious “Greg” Narain", "kids": [], "company": "Building new AI companies", "home": "", "askHome": [], "work": "Greg has spent 15+ years starting and building companies across social media, martech, creator tools, and AI. He’s worked as a CEO, CTO, and product leader, has gone through both Y Combinator and Techstars, and continues to build new companies and products in AI.", "askWork": ["Starting companies from zero", "AI products", "YC & Techstars", "What he’s building next"]}, {"id": "harrison-brodwin", "name": "Harrison Brodwin", "kids": [], "company": "Private counseling practice", "home": "", "askHome": ["Why dads probably need therapy too"], "work": "Harrison is a Denver-based Licensed Professional Counselor who runs his own private practice. His work focuses on men’s issues, anxiety, shame, substance use, family dynamics, and helping people communicate and show up more confidently.", "askWork": ["Men’s mental health", "Starting a private practice", "Communication"]}, {"id": "jorge-pongo", "name": "Jorge Pongo", "kids": [{"age": 4, "is": ""}, {"age": 2, "is": ""}], "company": "Ziggi’s Coffee", "home": "In the thick of it with a 2- and a 4-year-old.", "askHome": ["Surviving life with a 2- and 4-year-old"], "work": "Jorge is an entrepreneur, investor, and longtime sales leader with experience across SaaS, B2B, education, and startup advising. These days he’s in the coffee business with **Ziggi’s Coffee**.", "askWork": ["Coffee", "Building teams", "Sales", "Startups"]}, {"id": "lucas-droessler", "name": "Lucas Droessler", "kids": [{"age": 5, "is": "girl"}, {"age": 2, "is": "girl"}], "company": "NVOK", "home": "", "askHome": ["Girl-dad life"], "work": "Lucas is the CEO and co-founder of **NVOK**, a tech studio that builds web, cloud, platform, data, and other digital solutions for businesses. His background crosses strategy, operations, client work, and technology, and he describes himself as a professional “solutioner.”", "askWork": ["Building tech for businesses", "AI", "Cloud", "Solving weird business problems"]}, {"id": "mike-shai", "name": "Mike Shai", "kids": [{"age": 9, "is": ""}, {"age": 4, "is": ""}, {"age": 1, "is": ""}], "company": "LuchaFit and Dad & Co", "home": "Raising three kids while building a business with his wife.", "askHome": ["Building a business with your spouse", "Why this meetup exists"], "work": "Mike is a product designer turned entrepreneur, founder of **Dad & Co**, and co-founder of **LuchaFit**, a wrestling education company serving athletes, parents, coaches, and teams. After 10+ years designing software, he now works across product, ecommerce, marketing, brand, and operations.", "askWork": ["LuchaFit", "Product design", "Wrestling"]}, {"id": "solomon-luna", "name": "Solomon Luna Jr.", "kids": [], "company": "Syncron Comm LLC", "home": "", "askHome": [], "work": "Solomon is the co-owner and CEO of **Syncron Comm LLC**, working across structured cabling, security cameras, access control, voice/data, and commercial communications infrastructure. He also has a creative background in art, engineering graphics, and residential home design.", "askWork": ["Security systems", "Structured cabling", "Running a trades business", "Combining technical and creative work"]}, {"id": "tomas-marin", "name": "Tomas Marin", "kids": [], "company": "Salvus Payment Solutions", "home": "", "askHome": [], "work": "Tomas has spent about 20 years in merchant services with **Salvus Payment Solutions**, helping businesses handle payment processing and the infrastructure behind how they get paid.", "askWork": ["Credit-card processing", "Merchant fees", "The stuff business owners usually ignore until it gets expensive"]}, {"id": "trevor-schneider", "name": "Trevor Schneider", "kids": [], "company": "The Handy Dads", "home": "", "askHome": [], "work": "Trevor founded **The Handy Dads**, a Denver home-services company with a bigger mission: serve the community while creating well-paying, flexible jobs for single fathers so they can still show up for their kids. Before launching it, he spent about a decade in sales and business development.", "askWork": ["Building a mission-driven business", "Hiring dads", "Growing a local service company"]}, {"id": "tyler-schell", "name": "Tyler Schell", "kids": [{"age": 1, "is": ""}], "company": "Above Sea Level", "home": "New to dad life with a 1-year-old.", "askHome": ["Having a 1-year-old"], "work": "Tyler is an ecommerce entrepreneur and president of **Above Sea Level**. Before becoming a business owner, he spent years in advertising, sponsorship, and experiential marketing working with brands including Honda, Toyota, TikTok, Southwest Airlines, and UNICEF.", "askWork": ["Ecommerce", "Big-brand advertising", "Leaving agency life", "Building a consumer business"]}, {"id": "michael-weber", "name": "Michael Weber", "kids": [], "company": "Inside Partners", "home": "", "askHome": [], "work": "Michael is CEO and co-founder of **Inside Partners**, an AI-enabled services business helping companies actually put automation and AI to work. He’s a strategic AI architect and three-time B2B SaaS founder with 15+ years in digital transformation and operational AI.", "askWork": ["Where AI actually makes sense", "Building SaaS companies", "Getting teams to adopt AI"]}, {"id": "christopher-womack", "name": "Christopher Lee Womack", "kids": [], "company": "Gravity Haus food & beverage", "home": "", "askHome": [], "work": "Christopher has spent 15+ years managing commodity and operating risk and holds a master’s in finance and risk management. He’s also been a hands-on hospitality entrepreneur, owning and operating **Miller’s Bar & Grille**, expanding into food trucks and events, and more recently leading food and beverage operations at Gravity Haus.", "askWork": ["Restaurant margins", "Surviving food-cost swings", "Food trucks"]}, {"id": "matthew-krekeler", "name": "Matthew Krekeler", "kids": [{"age": null, "is": "girl"}, {"age": null, "is": "girl"}, {"age": null, "is": "girl"}, {"age": null, "is": "girl"}], "company": "Girl Dad Nation podcast", "home": "Raising four daughters, which is where Girl Dad Nation came from. Also into board games and hockey.", "askHome": ["Life with four daughters", "Board games", "Hockey"], "work": "Matthew has worked in video production for more than a decade, with a focus on post-production, and hosts the **Girl Dad Nation** podcast, built from conversations with other dads raising girls.", "askWork": ["Video production", "Podcasting"]}, {"id": "william-kowalski", "name": "William Kowalski", "kids": [{"age": 6, "is": ""}, {"age": 3, "is": ""}], "company": "Brightward Financial", "home": "Both kids were born while he and his wife were building Atomos.", "askHome": ["Starting a company while having kids"], "work": "William co-founded and helped operate **Atomos Space**, taking the aerospace company from an idea to a 40+ person team that launched two satellites before it was acquired in 2025. He’s now president and co-founder of **Brightward Financial**, doing investment and financial advisory work.", "askWork": ["Launching satellites", "Selling a startup", "Founder finances"]}, {"id": "isaac-pacheco", "name": "Isaac Pacheco", "kids": [], "company": "Beespoke Limited", "home": "", "askHome": [], "work": "Isaac is a longtime menswear and sales guy who now co-owns **Beespoke Limited**, a mobile custom-clothing business built around personalized suits, shirts, and fittings. The bigger vision is part clothing brand, part community hangout, eventually pairing custom menswear with a speakeasy-style meadery.", "askWork": ["Custom suits", "Starting Beespoke", "Mead"]}, {"id": "corey-montez", "name": "Corey Montez", "kids": [], "company": "Nesh Limited", "home": "", "askHome": [], "work": "Corey works at the intersection of engineering and design through **Nesh Limited**, offering industrial design, engineering design, 3D work, branding, and project management.", "askWork": ["Turning ideas into physical products", "3D design", "Building a multidisciplinary business"]}, {"id": "ignacio-martinez", "name": "Ignacio Martinez", "kids": [], "company": "VersaPro Solutions", "home": "", "askHome": ["Fitness & discipline"], "work": "Ignacio is the founder of **VersaPro Solutions** and describes himself as an all-around problem solver focused on helping small businesses get off the ground. His approach leans heavily on discipline, consistency, leadership, and practical execution.", "askWork": ["Starting VersaPro", "Building habits as a founder", "Small-business problems"]}, {"id": "win-nguyen", "name": "Win Nguyen", "kids": [], "company": "Agency Acquisitions", "home": "", "askHome": [], "work": "Win works with **Agency Acquisitions**, helping agency owners improve operations, profitability, staffing, and scale. His background spans sales, growth, partnerships, and helping service businesses build something that can run beyond the founder.", "askWork": ["Growing an agency", "Getting out of the weeds", "Building a company that doesn’t depend on you"]}, {"id": "ryan-johns", "name": "Ryan Johns", "kids": [], "company": "Ryan Johns Strength & Conditioning", "home": "", "askHome": ["Staying in shape while running a business"], "work": "Ryan owns and operates **Ryan Johns Strength & Conditioning**, a Denver-area strength and fitness business offering in-person and virtual training as well as an on-demand fitness platform.", "askWork": ["Strength training", "Building a coaching business", "Fitness apps"]}, {"id": "jeremiah-buschmann", "name": "Jeremiah Buschmann", "kids": [], "company": "JOB Home Services", "home": "", "askHome": [], "work": "Jeremiah owns **JOB Home Services**, a business built around residential and commercial projects ranging from decks and remodeling to painting, floor coatings, and other home-service work.", "askWork": ["Running a home-services company", "Customer service in the trades", "Wearing every hat as an owner"]}, {"id": "coleman", "name": "Coleman", "kids": [], "company": "DJ and event host", "home": "", "askHome": [], "work": "", "askWork": []}, {"id": "brian-anderson", "name": "Brian Anderson", "kids": [], "company": "", "home": "", "askHome": [], "work": "", "askWork": []}, {"id": "edgar-gomez", "name": "Edgar Gomez", "kids": [], "company": "", "home": "", "askHome": [], "work": "", "askWork": []}];

/* ---------- setup ---------- */

function setup() {
  const ss = ss_();
  const d = ss.getSheetByName(DIR) || ss.insertSheet(DIR);
  d.getRange(1, 1, d.getMaxRows(), COLS.length).setNumberFormat('@');
  if (d.getLastRow() < 2) {
    d.clear();
    d.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    const now = new Date().toISOString();
    const rows = SEED.map(e => [e.id, '', e.name, kidsText_(e.kids), e.home, e.askHome.join(', '),
      e.company, e.work, e.askWork.join(', '), '', '', '', now]);
    d.getRange(2, 1, rows.length, COLS.length).setValues(rows);
    d.setFrozenRows(1);
  }
  const p = ss.getSheetByName(PENDING) || ss.insertSheet(PENDING);
  p.getRange(1, 1, p.getMaxRows(), PCOLS.length).setNumberFormat('@');
  if (p.getLastRow() < 1) {
    p.getRange(1, 1, 1, PCOLS.length).setValues([PCOLS]).setFontWeight('bold');
    p.setFrozenRows(1);
  }
  const ev = ss.getSheetByName(EVENTS) || ss.insertSheet(EVENTS);
  const rs = ss.getSheetByName(RSVPS) || ss.insertSheet(RSVPS);
  ev.getRange(1, 1, ev.getMaxRows(), ECOLS.length).setNumberFormat('@');
  rs.getRange(1, 1, rs.getMaxRows(), RCOLS.length).setNumberFormat('@');
  const props = PropertiesService.getScriptProperties();
  if (ev.getLastRow() < 1) {
    ev.getRange(1, 1, 1, ECOLS.length).setValues([ECOLS]).setFontWeight('bold'); ev.setFrozenRows(1);
    rs.getRange(1, 1, 1, RCOLS.length).setValues([RCOLS]).setFontWeight('bold'); rs.setFrozenRows(1);
    // The seeded names are the current guest list until you import a Luma CSV.
    const dir = readDir_();
    ev.appendRow(['ev-initial', 'Current meetup', '', '', new Date().toISOString(), String(dir.length)]);
    if (dir.length) rs.getRange(2, 1, dir.length, RCOLS.length).setValues(dir.map(r => ['ev-initial', String(r.id), '', String(r.name), 'approved']));
    props.setProperty('CURRENT_EVENT', 'ev-initial');
  }
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', Utilities.getUuid().slice(0, 8));
  Logger.log('Admin key: ' + props.getProperty('ADMIN_KEY'));
}

/* ---------- web app entry points ---------- */

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = ACTIONS[req.action];
    if (!fn) throw new Error('Unknown action.');
    out = Object.assign({ ok: true }, fn(req));
  } catch (err) {
    out = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return doPost({ postData: { contents: JSON.stringify({ action: 'list' }) } });
}

const ACTIONS = {
  // Public view: full details for claimed profiles, name only for everyone else.
  list() {
    const pendingIds = {};
    pendingRows_().forEach(r => { pendingIds[String(r[1])] = true; });
    const guests = currentGuestIds_();
    const entries = readDir_().filter(r => r.name && !isHidden_(r) && (!guests || guests[String(r.id)])).map(r => isClaimed_(r)
      ? Object.assign(toPublic_(r), { claimed: true })
      : { id: String(r.id), name: String(r.name), claimed: false, pending: !!pendingIds[String(r.id)] });
    return { entries, event: publicEvent_(currentEvent_()) };
  },

  // Email-only access: returns the profile to pre-fill the form.
  open(req) {
    const auth = authorize_(req.email, req.id);
    return { email: auth.email, entry: ownerView_(auth.entry), pending: pendingFor_(String(auth.entry.id)) };
  },

  // Claims and edits go live immediately. The previous version is saved so you can undo.
  submit(req) {
    const auth = authorize_(req.email, req.id);
    const data = clean_(req.entry);
    const wasClaimed = isClaimed_(auth.entry);
    withLock_(() => {
      const entry = entryById_(auth.entry.id);
      const prev = Object.assign(toPublic_(entry), { claimed: isClaimed_(entry) });
      const fields = {
        name: data.name, kids: kidsText_(data.kids), home: data.home, askHome: data.askHome.join(', '),
        company: data.company, work: data.work, askWork: data.askWork.join(', '), links: linksText_(data.links),
        claimed: 'TRUE'
      };
      if (!String(entry.email || '').trim()) fields.email = auth.email;
      writeRow_(entry._row, fields);
      markPending_(entry.id, 'replaced');   // retire any old-style pending edits
      sheet_(PENDING).appendRow([Utilities.getUuid(), String(entry.id), auth.email, new Date().toISOString(), 'published',
        JSON.stringify(Object.assign({}, data, { _prev: prev, _claim: !prev.claimed }))]);
    });
    if (ADMIN_EMAIL) {
      MailApp.sendEmail(ADMIN_EMAIL,
        `${EVENT_NAME}: ${data.name} ${wasClaimed ? 'updated their profile' : 'claimed their profile'}`,
        'It is live now. Open the directory with #admin at the end of the URL to see recent changes or undo one.');
    }
    return { entry: ownerView_(entryById_(auth.entry.id)) };
  },

  // Hiding and clearing take effect right away: they only remove things from public view.
  setHidden(req) {
    const auth = authorize_(req.email, req.id);
    withLock_(() => writeRow_(auth.entry._row, { hidden: req.hidden ? 'TRUE' : '' }));
    return { entry: ownerView_(entryById_(auth.entry.id)) };
  },

  // Erases the details and returns the profile to name-only. A backup row goes to Pending.
  clearProfile(req) {
    const auth = authorize_(req.email, req.id);
    withLock_(() => {
      markPending_(auth.entry.id, 'withdrawn');
      sheet_(PENDING).appendRow([Utilities.getUuid(), String(auth.entry.id), auth.email, new Date().toISOString(),
        'cleared-backup', JSON.stringify(toPublic_(auth.entry))]);
      writeRow_(auth.entry._row, { kids: '', home: '', askHome: '', company: '', work: '', askWork: '', links: '', claimed: '' });
    });
    return { entry: ownerView_(entryById_(auth.entry.id)) };
  },

  adminEvent(req) {
    checkAdmin_(req.key);
    const ev = currentEvent_();
    const props = PropertiesService.getScriptProperties();
    const luma = {
      configured: !!props.getProperty('LUMA_API_KEY'),
      linked: !!props.getProperty('CURRENT_LUMA_EVENT'),
      lastSync: props.getProperty('LAST_LUMA_SYNC') || '',
      autoSync: ScriptApp.getProjectTriggers().some(tr => tr.getHandlerFunction() === 'syncLuma')
    };
    const ids = currentGuestIds_();
    return { luma, event: ev ? Object.assign(publicEvent_(ev), { guests: ids ? Object.keys(ids).length : 0, importedAt: String(ev.importedAt || '') }) : null };
  },

  // Import a Luma guest list. dryRun returns the match preview without changing anything.
  // guests: [{ name, email }] parsed from the Luma CSV in the browser.
  adminImport(req) {
    checkAdmin_(req.key);
    return importGuests_(req.event, req.guests, !!req.dryRun, null, null);
  },

  // ---- Luma API (needs LUMA_API_KEY in Script properties; Luma Plus) ----
  adminLumaEvents(req) {
    checkAdmin_(req.key);
    const after = new Date(Date.now() - 14 * 864e5).toISOString();
    const events = [];
    let cursor = '';
    for (let page = 0; page < 5; page++) {
      const res = luma_('/v1/calendar/list-events', { after, pagination_limit: 50, pagination_cursor: cursor });
      (res.entries || []).forEach(en => {
        const e = en.event || en;
        events.push({ id: String(e.api_id || en.api_id || ''), name: String(e.name || ''), date: lumaDate_(e), url: String(e.url || '') });
      });
      if (!res.has_more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }
    return { events: events.filter(e => e.id).slice(0, 40) };
  },

  adminLumaImport(req) {
    checkAdmin_(req.key);
    const id = String(req.eventId || '').trim();
    if (!id) throw new Error('Pick a Luma event.');
    const e = lumaEvent_(id);
    const { guests, skipped } = lumaGuests_(id);
    const out = importGuests_({ name: e.name, date: lumaDate_(e), url: e.url || '' }, guests, !!req.dryRun, null, id);
    return Object.assign(out, { skipped, event: { name: String(e.name || ''), date: lumaDate_(e) } });
  },

  adminLumaSyncNow(req) {
    checkAdmin_(req.key);
    return { synced: syncLuma() };
  },

  adminLumaAutoSync(req) {
    checkAdmin_(req.key);
    ScriptApp.getProjectTriggers().filter(tr => tr.getHandlerFunction() === 'syncLuma').forEach(tr => ScriptApp.deleteTrigger(tr));
    if (req.on) ScriptApp.newTrigger('syncLuma').timeBased().everyHours(1).create();
    return { autoSync: !!req.on };
  },


  // Organizer adds someone straight to the current guest list.
  adminAddPerson(req) {
    checkAdmin_(req.key);
    const name = String(req.name || '').trim().slice(0, 80);
    const email = normEmail_(req.email);
    if (!name) throw new Error('Add their name.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email doesn't look right.");
    return withLock_(() => addToCurrent_(name, email));
  },

  // Public: someone not on the list asks to be added. Goes to the review queue.
  requestJoin(req) {
    const name = String(req.name || '').trim().replace(/^[=+@]+/, '').slice(0, 80);
    const email = normEmail_(req.email);
    if (!name) throw new Error('Add your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Add the email you want to use for your profile.');
    const cache = CacheService.getScriptCache();
    if (cache.get('join:' + email)) throw new Error('We already have your request. An organizer will add you soon.');
    const guests = currentGuestIds_(), mine = findByEmail_(email);
    if (mine && (!guests || guests[String(mine.id)])) throw new Error("You're already on the list. Find your name below and tap Claim profile.");
    withLock_(() => {
      const sh = sheet_(PENDING), vals = sh.getDataRange().getValues();
      for (let k = 1; k < vals.length; k++) {
        if (vals[k][4] === 'pending' && String(vals[k][2]) === email && /"type":"join"/.test(vals[k][5])) sh.getRange(k + 1, 5).setValue('replaced');
      }
      sh.appendRow([Utilities.getUuid(), '', email, new Date().toISOString(), 'pending', JSON.stringify({ type: 'join', name })]);
    });
    cache.put('join:' + email, '1', 600);
    if (ADMIN_EMAIL) MailApp.sendEmail(ADMIN_EMAIL, `${EVENT_NAME}: ${name} asked to be added`, 'Open the directory with #admin at the end of the URL to review it.');
    return {};
  },

  // ---- Organizer editing: everyone in the Directory, no claiming needed ----
  adminPeople(req) {
    checkAdmin_(req.key);
    const guests = currentGuestIds_();
    const people = readDir_().filter(r => r.id && r.name).map(r => Object.assign(toPublic_(r), {
      email: String(r.email || ''), claimed: isClaimed_(r), hidden: isHidden_(r),
      onList: !guests || !!guests[String(r.id)], updatedAt: String(r.updatedAt || '')
    }));
    return { people, hasEvent: !!guests };
  },

  // Save any person's profile and settings. No id = create a new person.
  // Logged like a claim/edit (email "organizer"), so it shows in Recent changes with Undo.
  adminSavePerson(req) {
    checkAdmin_(req.key);
    const data = clean_(req.entry);
    const s = req.settings || {};
    const emails = String(s.email || '').split(/[\s,;]+/).map(normEmail_).filter(Boolean);
    if (emails.some(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw new Error("One of those emails doesn't look right.");
    const out = withLock_(() => {
      let entry = req.id ? entryById_(req.id) : null;
      if (req.id && !entry) throw new Error('That person no longer exists.');
      if (!entry) {
        const id = addToCurrent_(data.name, emails[0] || '').person.id;
        entry = entryById_(id);
      }
      const other = emails.map(e => findByEmail_(e)).find(r => r && String(r.id) !== String(entry.id));
      if (other) throw new Error(`That email is already used by ${other.name}.`);
      const prev = Object.assign(toPublic_(entry), { claimed: isClaimed_(entry) });
      writeRow_(entry._row, {
        name: data.name, kids: kidsText_(data.kids), home: data.home, askHome: data.askHome.join(', '),
        company: data.company, work: data.work, askWork: data.askWork.join(', '), links: linksText_(data.links),
        email: emails.join(', '), claimed: s.claimed ? 'TRUE' : '', hidden: s.hidden ? 'TRUE' : ''
      });
      setOnList_(String(entry.id), data.name, emails[0] || '', s.onList !== false);
      sheet_(PENDING).appendRow([Utilities.getUuid(), String(entry.id), 'organizer', new Date().toISOString(), 'published',
        JSON.stringify(Object.assign({}, data, { _prev: prev, _claim: false, _admin: true }))]);
      return entry.id;
    });
    return { id: String(out) };
  },

  // Last 25 published claims/edits, newest first. Only the latest change per person can be undone.
  adminRecent(req) {
    checkAdmin_(req.key);
    const rows = sheet_(PENDING).getDataRange().getValues().slice(1).filter(r => r[4] === 'published').reverse();
    const seen = {};
    const items = rows.slice(0, 25).map(r => {
      const data = JSON.parse(r[5]);
      const latest = !seen[String(r[1])]; seen[String(r[1])] = true;
      return { submissionId: String(r[0]), entryId: String(r[1]), email: String(r[2]), submittedAt: String(r[3]),
               claim: !!data._claim, name: data.name, prev: data._prev || null, now: stripMeta_(data), canUndo: latest };
    });
    return { items };
  },

  adminUndo(req) {
    checkAdmin_(req.key);
    withLock_(() => {
      const p = sheet_(PENDING), vals = p.getDataRange().getValues();
      const i = vals.findIndex((r, k) => k > 0 && String(r[0]) === String(req.submissionId));
      if (i < 0 || vals[i][4] !== 'published') throw new Error('That change was already undone.');
      const entryId = String(vals[i][1]);
      const newer = vals.some((r, k) => k > i && String(r[1]) === entryId && r[4] === 'published');
      if (newer) throw new Error('This person has made a newer change. Undo that one first.');
      const prev = JSON.parse(vals[i][5])._prev;
      const entry = entryById_(entryId);
      if (!prev || !entry) throw new Error("Can't find the earlier version.");
      writeRow_(entry._row, {
        name: prev.name, kids: kidsText_(prev.kids), home: prev.home, askHome: (prev.askHome || []).join(', '),
        company: prev.company, work: prev.work, askWork: (prev.askWork || []).join(', '), links: linksText_(prev.links),
        claimed: prev.claimed ? 'TRUE' : ''
      });
      p.getRange(i + 1, 5).setValue('undone');
    });
    return {};
  },

  adminList(req) {
    checkAdmin_(req.key);
    const byId = {};
    readDir_().forEach(r => { byId[String(r.id)] = r; });
    const dir = Object.keys(byId).map(k => byId[k]);
    const items = pendingRows_().map(r => {
      const data = JSON.parse(r[5]);
      const base = { submissionId: String(r[0]), email: String(r[2]), submittedAt: String(r[3]) };
      if (data.type === 'join') {
        const hit = findMatch_(dir, data.name, String(r[2]));
        return Object.assign(base, { type: 'join', proposed: data, matchedName: hit ? String(hit.name) : '' });
      }
      return Object.assign(base, { current: byId[String(r[1])] ? ownerView_(byId[String(r[1])]) : null, proposed: data });
    });
    return { items };
  },

  adminDecide(req) {
    checkAdmin_(req.key);
    if (req.decision !== 'approve' && req.decision !== 'reject') throw new Error('Unknown decision.');
    withLock_(() => {
      const p = sheet_(PENDING);
      const vals = p.getDataRange().getValues();
      const i = vals.findIndex((r, idx) => idx > 0 && String(r[0]) === String(req.submissionId));
      if (i < 0 || vals[i][4] !== 'pending') throw new Error('That submission was already handled.');
      const data0 = JSON.parse(vals[i][5]);
      if (data0.type === 'join') {
        if (req.decision === 'approve') addToCurrent_(data0.name, String(vals[i][2]));
        p.getRange(i + 1, 5).setValue(req.decision === 'approve' ? 'approved' : 'rejected');
        return;
      }
      if (req.decision === 'approve') {
        const data = JSON.parse(vals[i][5]);
        const entry = entryById_(vals[i][1]);
        if (!entry) throw new Error('The directory entry for this submission no longer exists.');
        const fields = {
          name: data.name, kids: kidsText_(data.kids), home: data.home, askHome: data.askHome.join(', '),
          company: data.company, work: data.work, askWork: data.askWork.join(', '), links: linksText_(data.links),
          claimed: 'TRUE'
        };
        if (!String(entry.email || '').trim()) fields.email = String(vals[i][2]);
        writeRow_(entry._row, fields);
      }
      p.getRange(i + 1, 5).setValue(req.decision === 'approve' ? 'approved' : 'rejected');
    });
    return {};
  }
};

/* ---------- auth: email only ---------- */

// With an id (claiming from a name), the email must match that row's RSVP email, or the row
// must have no email on file yet. Without an id, the email has to be on the RSVP list.
function authorize_(rawEmail, id) {
  const email = normEmail_(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter the email address you RSVP'd with.");
  const byEmail = findByEmail_(email);
  if (id) {
    const target = entryById_(id);
    if (!target) throw new Error('That profile no longer exists.');
    if (byEmail && String(byEmail.id) !== String(target.id)) throw new Error('That email is connected to a different profile.');
    if (!byEmail && String(target.email || '').trim()) {
      throw new Error(`That email doesn't match the RSVP for ${target.name}. Use the address you RSVP'd with.`);
    }
    return { email, entry: target };
  }
  if (!byEmail) throw new Error("That email isn't on the RSVP list. Find your name in the directory and tap Claim profile.");
  return { email, entry: byEmail };
}

/* ---------- helpers ---------- */

function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('The directory isn’t set up yet. Run setup() in Apps Script.');
  return sh;
}

function readDir_() {
  const vals = sheet_(DIR).getDataRange().getValues();
  const head = vals.shift();
  return vals.map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((k, j) => { o[k] = r[j]; });
    return o;
  });
}

function entryById_(id) { return readDir_().find(r => String(r.id) === String(id)) || null; }

function toPublic_(o) {
  return {
    id: String(o.id),
    name: String(o.name || ''),
    kids: parseKids_(o.kids),
    home: String(o.home || ''),
    askHome: splitList_(o.askHome),
    company: String(o.company || ''),
    work: String(o.work || ''),
    askWork: splitList_(o.askWork),
    links: parseLinks_(o.links)
  };
}


/* ---------- Luma ---------- */

// Re-pulls the current Luma event's guest list. Runs hourly when auto-sync is on.
function syncLuma() {
  const props = PropertiesService.getScriptProperties();
  const lumaId = props.getProperty('CURRENT_LUMA_EVENT'), eventId = props.getProperty('CURRENT_EVENT');
  if (!lumaId || !eventId) return 0;
  const e = lumaEvent_(lumaId);
  const { guests } = lumaGuests_(lumaId);
  if (!guests.length) return 0;
  const out = importGuests_({ name: e.name, date: lumaDate_(e), url: e.url || '' }, guests, false, eventId, lumaId);
  return out.rows.length;
}

function luma_(path, params) {
  const key = PropertiesService.getScriptProperties().getProperty('LUMA_API_KEY');
  if (!key) throw new Error('No Luma API key yet. In Apps Script, add LUMA_API_KEY under Project Settings → Script properties.');
  const qs = Object.keys(params || {}).filter(k => params[k] !== '' && params[k] != null)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const res = UrlFetchApp.fetch('https://public-api.luma.com' + path + (qs ? '?' + qs : ''), {
    headers: { 'x-luma-api-key': key, accept: 'application/json' }, muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code === 401 || code === 403) throw new Error('Luma rejected the API key. Check LUMA_API_KEY and that the calendar is on Luma Plus.');
  if (code === 404) throw new Error("Luma couldn't find that event on your calendar.");
  if (code === 429) throw new Error('Luma is rate-limiting requests. Try again in a minute.');
  if (code >= 300) throw new Error('Luma returned an error (' + code + ').');
  return JSON.parse(res.getContentText() || '{}');
}

function lumaEvent_(id) {
  const res = luma_('/v1/event/get', { api_id: id });
  return res.event || res;
}

// Going guests only. Handles both the older (name/email) and newer (user_name/user_email) field names.
function lumaGuests_(eventId) {
  const guests = [];
  let skipped = 0, cursor = '';
  for (let page = 0; page < 40; page++) {
    const res = luma_('/v1/event/get-guests', { event_api_id: eventId, pagination_limit: 100, pagination_cursor: cursor });
    (res.entries || []).forEach(en => {
      const g = en.guest || en;
      const status = String(g.approval_status || '').toLowerCase();
      if (status && status !== 'approved') { skipped++; return; }
      const first = g.user_first_name || g.first_name || '', last = g.user_last_name || g.last_name || '';
      const name = String((first && last ? first + ' ' + last : '') || g.user_name || g.name || [first, last].join(' ')).trim();
      const email = String(g.user_email || g.email || '').trim().toLowerCase();
      if (name || email) guests.push({ name: name || email.split('@')[0], email });
    });
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return { guests, skipped };
}

function lumaDate_(e) {
  const d = e && (e.start_at || e.startAt);
  if (!d) return '';
  try { return Utilities.formatDate(new Date(d), e.timezone || Session.getScriptTimeZone(), 'EEE, MMM d'); } catch (x) { return ''; }
}

// Shared by CSV and Luma imports. replaceEventId: re-sync that event's guest list in place (auto-sync).
function importGuests_(event, rawGuests, dryRun, replaceEventId, lumaEventId) {
    event = event || {};
    const evName = String(event.name || '').trim().slice(0, 120);
    if (!evName) throw new Error('Add the event name.');
    const seen = {};
    const guests = (Array.isArray(rawGuests) ? rawGuests : []).map(g => ({
      name: String((g && g.name) || '').trim().slice(0, 80),
      email: normEmail_(g && g.email)
    })).filter(g => g.name && (g.email ? !seen[g.email] && (seen[g.email] = true) : true));
    if (!guests.length) throw new Error('No guests going to this event yet.');

    const run = () => {
      const dir = readDir_();
      const usedIds = {};
      dir.forEach(r => { usedIds[String(r.id)] = true; });
      const claimedIds = {};
      const plan = guests.map(g => {
        let hit = g.email && dir.find(r => String(r.email || '').toLowerCase().split(/[\s,;]+/).indexOf(g.email) >= 0);
        let how = hit ? 'email' : '';
        if (!hit) {
          const keys = nameKeys_(g.name), first = firstName_(g.name);
          hit = dir.find(r => {
            if (claimedIds[String(r.id)]) return false;
            const rk = nameKeys_(r.name);
            // A one-word name in the Directory (e.g. "Coleman") matches that first name on Luma.
            if (rk.length === 1 && rk[0].indexOf(' ') < 0) return rk[0] === first;
            return rk.some(k => keys.indexOf(k) >= 0);
          });
          how = hit ? 'name' : 'new';
        }
        if (hit) claimedIds[String(hit.id)] = true;
        let id = hit ? String(hit.id) : slug_(g.name);
        if (!hit) { let n = 2, base = id; while (usedIds[id]) id = base + '-' + (n++); usedIds[id] = true; }
        return { name: g.name, email: g.email, how, entryId: id, matchedName: hit ? String(hit.name) : '', row: hit ? hit._row : 0,
                 currentEmail: hit ? String(hit.email || '') : '' };
      });
      if (dryRun) return plan;

      const d = sheet_(DIR);
      const head = d.getRange(1, 1, 1, d.getLastColumn()).getValues()[0];
      plan.forEach(p => {
        if (p.how === 'new') {
          const row = head.map(k => k === 'id' ? p.entryId : k === 'email' ? p.email : k === 'name' ? p.name
            : k === 'updatedAt' ? new Date().toISOString() : '');
          d.appendRow(row);
        } else if (p.email && p.how === 'name') {
          const emails = p.currentEmail.trim();
          writeRow_(p.row, { email: emails ? emails + ', ' + p.email : p.email });
        }
      });
      const rs = sheet_(RSVPS);
      let eventId = replaceEventId;
      if (eventId) {
        // Re-sync: replace this event's Luma rows, but keep people you added by hand.
        const inPlan = {}; plan.forEach(p => { inPlan[p.entryId] = true; });
        const keep = rs.getDataRange().getValues().filter((r, k) => k === 0 || String(r[0]) !== eventId
          || (r[4] === 'manual' && !inPlan[String(r[1])]));
        rs.clearContents();
        rs.getRange(1, 1, keep.length, RCOLS.length).setValues(keep);
        const evs = sheet_(EVENTS), ev = evs.getDataRange().getValues();
        const k = ev.findIndex(r => String(r[0]) === eventId);
        if (k > 0) evs.getRange(k + 1, 5, 1, 2).setValues([[new Date().toISOString(), String(plan.length)]]);
      } else {
        eventId = 'ev-' + Date.now();
        sheet_(EVENTS).appendRow([eventId, evName, String(event.url || '').trim(),
          String(event.date || '').trim(), new Date().toISOString(), String(plan.length)]);
        const props = PropertiesService.getScriptProperties();
        if (lumaEventId) props.setProperty('CURRENT_LUMA_EVENT', lumaEventId); else props.deleteProperty('CURRENT_LUMA_EVENT');
      }
      rs.getRange(rs.getLastRow() + 1, 1, plan.length, RCOLS.length)
        .setValues(plan.map(p => [eventId, p.entryId, p.email, p.name, 'approved']));
      PropertiesService.getScriptProperties().setProperty('CURRENT_EVENT', eventId);
      PropertiesService.getScriptProperties().setProperty('LAST_LUMA_SYNC', lumaEventId || replaceEventId ? new Date().toISOString() : '');
      return plan;
    };
    const plan = dryRun ? run() : withLock_(run);
    return { dryRun: !!dryRun, rows: plan.map(p => ({ name: p.name, email: p.email, how: p.how, matchedName: p.matchedName })) };
}

// Match by email, then by name (same rules as imports).
function stripMeta_(d) { const o = Object.assign({}, d); delete o._prev; delete o._claim; return o; }

function findMatch_(dir, name, email) {
  email = normEmail_(email);
  let hit = email && dir.find(r => String(r.email || '').toLowerCase().split(/[\s,;]+/).indexOf(email) >= 0);
  if (hit) return hit;
  const keys = nameKeys_(name), first = firstName_(name);
  return dir.find(r => {
    const rk = nameKeys_(r.name);
    if (rk.length === 1 && rk[0].indexOf(' ') < 0) return rk[0] === first;
    return rk.some(k => keys.indexOf(k) >= 0);
  }) || null;
}

// Adds a person to the Directory (if new) and to the current event as a manual guest,
// which Luma syncs leave in place. Call inside withLock_.
function addToCurrent_(name, email) {
  const dir = readDir_();
  let hit = findMatch_(dir, name, email), how = hit ? 'existing' : 'new', id;
  if (hit) {
    id = String(hit.id);
    const have = String(hit.email || '').trim();
    if (email && have.toLowerCase().split(/[\s,;]+/).indexOf(email) < 0) writeRow_(hit._row, { email: have ? have + ', ' + email : email });
  } else {
    const used = {}; dir.forEach(r => { used[String(r.id)] = true; });
    id = slug_(name); let n = 2; const base = id; while (used[id]) id = base + '-' + (n++);
    const d = sheet_(DIR), head = d.getRange(1, 1, 1, d.getLastColumn()).getValues()[0];
    d.appendRow(head.map(k => k === 'id' ? id : k === 'email' ? email : k === 'name' ? name : k === 'updatedAt' ? new Date().toISOString() : ''));
  }
  const eventId = PropertiesService.getScriptProperties().getProperty('CURRENT_EVENT');
  let added = false;
  if (eventId) {
    const rs = sheet_(RSVPS);
    const already = rs.getDataRange().getValues().some(r => String(r[0]) === eventId && String(r[1]) === id);
    if (!already) { rs.appendRow([eventId, id, email, name, 'manual']); added = true; }
  }
  return { person: { id, name: hit ? String(hit.name) : name, how, added } };
}

// Put a person on (or take them off) the current event's guest list.
function setOnList_(id, name, email, on) {
  const eventId = PropertiesService.getScriptProperties().getProperty('CURRENT_EVENT');
  if (!eventId) return;
  const rs = sheet_(RSVPS), vals = rs.getDataRange().getValues();
  const rows = []; vals.forEach((r, k) => { if (k > 0 && String(r[0]) === eventId && String(r[1]) === id) rows.push(k + 1); });
  if (on && !rows.length) rs.appendRow([eventId, id, email, name, 'manual']);
  if (!on) rows.reverse().forEach(n => rs.deleteRow(n));
}

function currentEvent_() {
  const id = PropertiesService.getScriptProperties().getProperty('CURRENT_EVENT');
  const sh = ss_().getSheetByName(EVENTS);
  if (!id || !sh) return null;
  const vals = sh.getDataRange().getValues(), head = vals.shift();
  const row = vals.find(r => String(r[0]) === id);
  if (!row) return null;
  const o = {}; head.forEach((k, j) => { o[k] = row[j]; });
  return o;
}

function publicEvent_(ev) {
  return ev ? { name: String(ev.name || ''), url: String(ev.url || ''), date: String(ev.date || '') } : null;
}

// Entry ids on the current event's guest list, or null (show everyone) if no event is set.
function currentGuestIds_() {
  const id = PropertiesService.getScriptProperties().getProperty('CURRENT_EVENT');
  const sh = ss_().getSheetByName(RSVPS);
  if (!id || !sh) return null;
  const out = {};
  sh.getDataRange().getValues().slice(1).forEach(r => { if (String(r[0]) === id) out[String(r[1])] = true; });
  return out;
}

// "Gregarious “Greg” Narain" → ["gregarious narain", "greg narain"]; drops Jr/Sr/II and middle names.
function nameKeys_(name) {
  let s = deaccent_(name).toLowerCase();
  const nicks = [];
  s = s.replace(/[“"'‘]([^”"'’]+)[”"'’]/g, (m, n) => { nicks.push(n.trim()); return ' '; });
  const toks = s.replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean).filter(x => !/^(jr|sr|ii|iii|iv)$/.test(x));
  if (!toks.length) return [];
  const last = toks[toks.length - 1];
  if (toks.length === 1) return [last];
  return [toks[0]].concat(nicks).map(f => f + ' ' + last);
}

function firstName_(name) {
  const t = deaccent_(name).toLowerCase().replace(/[“"'‘][^”"'’]+[”"'’]/g, ' ').replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean);
  return t[0] || '';
}

function deaccent_(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function slug_(name) {
  return deaccent_(name || 'guest').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guest';
}

function flag_(v) { return /^(true|yes|1)$/i.test(String(v || '').trim()); }
function isHidden_(o) { return flag_(o.hidden); }
function isClaimed_(o) { return flag_(o.claimed); }
function ownerView_(o) { return Object.assign(toPublic_(o), { hidden: isHidden_(o), claimed: isClaimed_(o) }); }

// Write named columns on one Directory row and stamp updatedAt.
function writeRow_(row, fields) {
  const sh = sheet_(DIR);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const all = Object.assign({}, fields, { updatedAt: new Date().toISOString() });
  Object.keys(all).forEach(k => {
    const c = head.indexOf(k);
    if (c < 0) throw new Error('The Directory tab is missing the "' + k + '" column. Add it or rerun setup().');
    sh.getRange(row, c + 1).setValue(all[k]);
  });
}

function pendingRows_() {
  return sheet_(PENDING).getDataRange().getValues().slice(1).filter(r => r[4] === 'pending');
}

function markPending_(entryId, status) {
  const sh = sheet_(PENDING);
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][1]) === String(entryId) && vals[i][4] === 'pending') sh.getRange(i + 1, 5).setValue(status);
  }
}

function pendingFor_(entryId) {
  const row = pendingRows_().reverse().find(r => String(r[1]) === entryId);
  return row ? JSON.parse(row[5]) : null;
}

function parseKids_(s) {
  return String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).map(x => {
    const m = x.match(/^(\d+|\?)?\s*(girl|boy)?/);
    const age = m && m[1] && m[1] !== '?' ? Number(m[1]) : null;
    return { age, is: (m && m[2]) || '' };
  }).slice(0, 12);
}

function kidsText_(kids) {
  return (kids || []).map(k => (k.age == null ? '?' : k.age) + (k.is ? ' ' + k.is : '')).join(', ');
}

function parseLinks_(s) {
  return String(s || '').split(/\n/).map(line => {
    const m = line.match(/^\s*(instagram|twitter|website|phone|email|other)\s*:\s*(.+)$/i);
    if (m) return { type: m[1].toLowerCase(), value: m[2].trim() };
    return line.trim() ? { type: 'other', value: line.trim() } : null;
  }).filter(Boolean).slice(0, 8);
}

function linksText_(links) {
  return (links || []).map(l => l.type + ': ' + l.value).join('\n');
}

function splitList_(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
function normEmail_(s) { return String(s || '').trim().toLowerCase(); }

function findByEmail_(email) {
  if (!email || email.indexOf('@') < 1) return null;
  // The email cell may hold more than one address, separated by commas or spaces.
  return readDir_().find(r => String(r.email || '').toLowerCase().split(/[\s,;]+/).indexOf(email) >= 0) || null;
}

function checkAdmin_(key) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!real || String(key || '') !== real) throw new Error('That admin key is wrong.');
}

function clean_(e) {
  e = e || {};
  const text = (v, max) => String(v || '').replace(/\r/g, '').trim().replace(/^[=+@]+/, '').slice(0, max);
  const list = v => (Array.isArray(v) ? v : String(v || '').split(','))
    .map(x => text(x, 80).replace(/,/g, '')).filter(Boolean).slice(0, 12);
  const out = {
    name: text(e.name, 80),
    kids: (Array.isArray(e.kids) ? e.kids : []).slice(0, 12).map(k => {
      const n = parseInt(k && k.age, 10);
      return { age: isNaN(n) ? null : Math.max(0, Math.min(60, n)), is: k && (k.is === 'girl' || k.is === 'boy') ? k.is : '' };
    }),
    home: text(e.home, 1200),
    askHome: list(e.askHome),
    company: text(e.company, 100),
    work: text(e.work, 1200),
    askWork: list(e.askWork),
    links: (Array.isArray(e.links) ? e.links : []).map(l => ({
      type: LINK_TYPES.indexOf(l && l.type) >= 0 ? l.type : 'other',
      value: String((l && l.value) || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
    })).filter(l => l.value).slice(0, 8)
  };
  if (!out.name) throw new Error('Add your name.');
  return out;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}
