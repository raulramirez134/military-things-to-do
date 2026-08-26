// Shared data for Military Things To Do — Naval Station Norfolk
// Loaded by norfolk.html (listings) and listing.html (detail pages, ?base=norfolk)
//
// NOTE: this base is a work in progress. Started with a first researched batch
// of restaurants; more categories to follow. Coordinates for this first batch
// were estimated from known downtown Norfolk / Ghent neighborhood landmarks
// rather than a precise per-address geocode — reasonably accurate for
// distance sorting, but worth spot-checking against a mapping tool over time.

const places = [
  // Restaurants & Cafés
  { id:"saltine-norfolk", name:"Saltine", cat:"restaurant", dist:11.22, lat:36.847, lng:-76.291, addr:"100 E Main St, Norfolk", blurb:"An elevated seafood restaurant in the historic Decker building downtown — oysters, a curated raw bar, and a genuinely refined atmosphere for a nicer night out.", hours:"Mon–Thu,Sun 11:30–23:00 · Fri/Sat 11:30–24:00", phone:"+1 757-763-6280", rating:4.5, reviewCount:927 },
  { id:"no-frill-bar-and-grill", name:"No Frill Bar and Grill", cat:"restaurant", dist:7.86, lat:36.877, lng:-76.296, addr:"806 Spotswood Ave, Norfolk", blurb:"A Ghent neighborhood institution for over 20 years — comfort food classics like meatloaf and Sunday brunch, in a colorful, casual setting with a loyal following.", hours:"Mon,Sun 11–20 · Tue–Sat 11–21", phone:"+1 757-627-4262", rating:4.6, reviewCount:1135 },
  { id:"fair-grounds-coffee", name:"Fair Grounds Coffee Cafe", cat:"restaurant", dist:7.87, lat:36.877, lng:-76.295, addr:"806 Baldwin Ave #2, Norfolk", blurb:"Norfolk's oldest independent coffee shop, tucked into a quirky two-story house in Ghent — great espresso, in-house sandwiches, and a genuinely cozy place to sit a while.", hours:"Mon–Thu,Sun 7–20 · Fri/Sat 7–21", phone:"+1 757-640-2899", rating:4.6, reviewCount:369 },
  { id:"redwood-smoke-shack-norfolk", name:"Redwood Smoke Shack", cat:"restaurant", dist:8.01, lat:36.876, lng:-76.293, addr:"2001 Manteo St, Norfolk", blurb:"Texas-style BBQ smoked low and slow over oak, hickory, and pecan — genuinely great brisket, and one of the only spots in Hampton Roads pouring Texas' own Big Red soda.", hours:"Tue–Sat 11–20 · Closed Sun/Mon", phone:"+1 757-624-1000", rating:4.7, reviewCount:433 },

  // Grocery & Food Stores
  { id:"harris-teeter-ghent", name:"Harris Teeter (Ghent Square)", cat:"grocery", dist:8.00, lat:36.876, lng:-76.294, addr:"1320 Colonial Ave, Norfolk", blurb:"A large, well-stocked two-story Harris Teeter in Ghent Square — genuinely excellent meat and seafood counter, though it gets crowded on weekend mornings and Monday evenings.", hours:"Daily 6:00–23:00", phone:"+1 757-533-9284", rating:4.3, reviewCount:2385 },
  { id:"norfolk-navsta-commissary", name:"Naval Station Norfolk Commissary", cat:"grocery", dist:0.20, lat:36.947, lng:-76.312, addr:"1588 Mall Dr, Naval Station Norfolk", blurb:"The on-base commissary — a full grocery selection at commissary pricing, plus a deli, bakery, rotisserie chicken, and early-bird hours before regular opening.", hours:"Mon,Tue,Wed,Fri,Sat,Sun 9:00–19:00 · Thu 9:00–20:00", phone:"+1 757-423-6070", rating:4.0, reviewCount:15 },

  // Auto & Transportation
  { id:"mwr-nex-auto-center", name:"MWR/NEX Auto Center", cat:"auto", dist:0.21, lat:36.945, lng:-76.309, addr:"1st Ave & W D St, Bldg U-126, Naval Station Norfolk", blurb:"The on-base auto center — state inspections, tires, and routine maintenance without leaving the installation, run through the Navy Exchange.", hours:"Mon–Fri 10:00–18:00", phone:"+1 757-444-1130", rating:3.6, reviewCount:0 },
  { id:"bingo-tire-auto-service", name:"Bingo Tire & Auto Service", cat:"auto", dist:4.33, lat:36.912, lng:-76.288, addr:"7718 Granby St, Norfolk", blurb:"A full-service shop handling brakes, batteries, alignments, and inspections — convenient for Ghent, Ocean View, and Naval Station Norfolk drivers alike.", hours:"Mon–Fri 8:00–18:00 · Sat 8:00–16:00 · Closed Sun", phone:"+1 757-583-0008", rating:4.4, reviewCount:210 },

  // Health & Personal Care
  { id:"naval-medical-center-portsmouth", name:"Naval Medical Center Portsmouth", cat:"health", dist:11.05, lat:36.84750, lng:-76.30472, addr:"620 John Paul Jones Cir, Portsmouth", blurb:"The Navy's oldest continuously operating hospital and the primary TRICARE medical center serving Naval Station Norfolk — a full-service military hospital, open around the clock.", hours:"Open 24 hours", phone:"+1 757-953-5000", rating:3.8, reviewCount:77 },
  { id:"sentara-norfolk-general", name:"Sentara Norfolk General Hospital", cat:"health", dist:9.53, lat:36.8612583, lng:-76.30355, addr:"600 Gresham Dr, Norfolk", blurb:"Hampton Roads' only Level I trauma center and the region's major teaching hospital — the go-to for serious emergencies not handled at a base clinic.", hours:"Open 24 hours", phone:null, rating:3.4, reviewCount:0 },

  // Banking & Financial Services
  { id:"navy-federal-hampton-blvd", name:"Navy Federal Credit Union (Hampton Blvd)", cat:"banking", dist:6.66, lat:36.887, lng:-76.305, addr:"7979 Hampton Blvd, Norfolk", blurb:"The credit union built specifically for military families — this branch sits right along Hampton Blvd near the base, though expect a wait on paydays and Saturdays.", hours:"Mon–Fri 9:00–19:30 · Sat 9:00–13:00 · Closed Sun", phone:"+1 888-842-6328", rating:3.2, reviewCount:17 },

  // Housing & Off-Base Living
  { id:"gates-of-west-bay", name:"Gates of West Bay Apartments", cat:"housing", dist:2.90, lat:36.9502, lng:-76.2775, addr:"272 W Bay Ave, Norfolk", blurb:"A pet-friendly apartment community in West Ocean View, just a couple blocks from the base gates — 1-3 bedroom units with a pool, sundeck, and recently renovated units.", hours:"Mon–Fri 9:00–17:00 · Closed Sat/Sun", phone:"+1 757-378-0771", rating:3.9, reviewCount:0 },

  // Schools & Childcare
  { id:"ghent-school", name:"Ghent School", cat:"schools", dist:8.00, lat:36.876, lng:-76.294, addr:"200 Shirley Ave, Norfolk", blurb:"A well-regarded K-8 public school in Ghent with a Gifted & Talented program — part of Norfolk Public Schools, which serves the base and has multiple schools with the Virginia Purple Star military-friendly designation.", hours:"Mon–Fri 7:30–15:30", phone:"+1 757-628-2565", rating:4.2, reviewCount:0 },

  // Fitness
  { id:"n24-gym", name:"N-24 Gym (Naval Station Norfolk)", cat:"fitness", dist:0.11, lat:36.947, lng:-76.311, addr:"Gilbert St, Bldg N-24, Naval Station Norfolk", blurb:"The main on-base fitness center — free for active duty, with cardio equipment, weights, and group classes just steps from the gate.", hours:"Contact for hours", phone:"+1 757-444-2276", rating:3.8, reviewCount:0 },
  { id:"onelife-fitness-norfolk", name:"Onelife Fitness Norfolk", cat:"fitness", dist:7.84, lat:36.877, lng:-76.297, addr:"1900 Monticello Ave, Norfolk", blurb:"A large, full-amenity gym with a pool, group classes, kids club, and a women's-only workout area — a step up from a basic gym if you want the extras.", hours:"Mon–Thu 5:00–23:00 · Fri 5:00–22:00 · Sat/Sun 7:00–20:00", phone:"+1 757-248-4800", rating:4.1, reviewCount:241 },

  // Pet Services
  { id:"ghent-veterinary-hospital", name:"Ghent Veterinary Hospital", cat:"pets", dist:8.09, lat:36.875, lng:-76.295, addr:"939 W 21st St, Norfolk", blurb:"An AAHA-accredited small animal hospital with a genuinely low-stress, fear-free approach — routine care, surgery, dentistry, and in-house diagnostics.", hours:"Mon,Wed,Thu,Fri 8:00–17:00 · Tue 8:00–19:00 · Sat 9:00–14:00 · Closed Sun", phone:"+1 757-351-0167", rating:4.7, reviewCount:41 },

  // Museums & Attractions
  { id:"nauticus", name:"Nauticus", cat:"museum", dist:11.24, lat:36.8468, lng:-76.2915, addr:"1 Waterside Dr, Norfolk", blurb:"A maritime-themed science center on the downtown waterfront, home to the Battleship Wisconsin — hands-on exhibits covering the region's naval and maritime history, genuinely great for kids.", hours:"Mon–Sat 9:00–17:00 · Sun 10:00–17:00", phone:"+1 757-664-1000", rating:4.5, reviewCount:0 },
  { id:"hampton-roads-naval-museum", name:"Hampton Roads Naval Museum", cat:"museum", dist:11.24, lat:36.8468, lng:-76.2915, addr:"1 Waterside Dr (inside Nauticus), Norfolk", blurb:"A free, AAM-accredited Navy museum covering over 235 years of naval history in Hampton Roads — ask at the Nauticus entrance to be directed up to the second floor.", hours:"Tue–Sat 10:00–17:00 · Sun 12:00–17:00 · Closed Mon", phone:"+1 757-322-3108", rating:4.6, reviewCount:0 },
  { id:"chrysler-museum-of-art", name:"Chrysler Museum of Art", cat:"museum", dist:10.11, lat:36.857, lng:-76.292, addr:"1 Memorial Pl, Norfolk", blurb:"One of America's top mid-sized art museums, with free admission every day — over 30,000 objects including one of the country's great glass collections, plus a working glass studio with live demos.", hours:"Tue–Sat 10:00–17:00 · Sun 12:00–17:00 · Closed Mon", phone:"+1 757-664-6200", rating:4.8, reviewCount:0 },

  // Beaches
  { id:"virginia-beach-boardwalk", name:"Virginia Beach Boardwalk", cat:"beaches", dist:31.30, lat:36.8529, lng:-75.9780, addr:"Atlantic Ave, Virginia Beach", blurb:"A 3-mile oceanfront boardwalk and beach, free and open 24 hours — restaurants, shops, a fishing pier, and a dedicated bike path, about 30-40 minutes from the base depending on traffic.", hours:"Open 24 hours", phone:null, rating:4.6, reviewCount:0 },

  // Historic Triangle Day Trips
  { id:"colonial-williamsburg", name:"Colonial Williamsburg", cat:"historic", dist:50.41, lat:37.2707, lng:-76.7075, addr:"101 Visitor Center Dr, Williamsburg", blurb:"America's largest living-history museum — an entire 18th-century colonial capital brought to life with costumed interpreters, historic trades, and taverns. Open 365 days a year, about an hour from the base.", hours:"Daily 9:30–17:00", phone:"+1 800-447-8679", rating:4.7, reviewCount:0 },

  // Shopping
  { id:"wards-corner-shopping-center", name:"Wards Corner Shopping Center", cat:"shopping", dist:6.36, lat:36.912, lng:-76.253, addr:"E Little Creek Rd & Granby St, Norfolk", blurb:"A historic Norfolk shopping hub currently undergoing major revitalization, anchored by a Harris Teeter with a Target under construction — worth checking for the mix of local and national retailers.", hours:"Varies by store", phone:null, rating:3.7, reviewCount:0 },

  // Outdoors & Kids
  { id:"norfolk-botanical-garden", name:"Norfolk Botanical Garden", cat:"outdoors", dist:10.44, lat:36.90278, lng:-76.20611, addr:"6700 Azalea Garden Rd, Norfolk", blurb:"A 175-acre garden with over 65 themed gardens and a 3-acre children's adventure garden — explore by tram, boat, or on foot, one of the largest azalea and camellia collections on the East Coast.", hours:"Daily 9:00–19:00", phone:"+1 757-441-5830", rating:4.7, reviewCount:0 },
  { id:"virginia-zoo", name:"Virginia Zoo", cat:"kids", dist:9.19, lat:36.8712, lng:-76.2681, addr:"3500 Granby St, Norfolk", blurb:"A well-loved AZA-accredited zoo dating back to 1901 — giraffes, rhinos, a petting zoo, and a train ride, genuinely great for a half-day with kids.", hours:"Daily 9:30–16:00", phone:"+1 757-441-2374", rating:4.5, reviewCount:274 },

  // Attractions Around Hampton Roads — the base sits at the center of a genuinely
  // large metro area (Virginia Beach, Portsmouth, Newport News, Hampton, Chesapeake,
  // Suffolk), each with its own worthwhile things to do, not just Norfolk itself.
  { id:"virginia-aquarium", name:"Virginia Aquarium & Marine Science Center", cat:"attraction", dist:30.78, lat:36.8195, lng:-76.0025, addr:"717 General Booth Blvd, Virginia Beach", blurb:"Over 800,000 gallons of exhibits and 300+ species — sharks, sea turtles, seals, and a nature trail out over the marsh. A genuinely great full day out, with a military discount on admission.", hours:"Daily 9:00–17:00", phone:"+1 757-385-3474", rating:4.6, reviewCount:457 },
  { id:"mariners-museum-park", name:"The Mariners' Museum and Park", cat:"attraction", dist:19.86, lat:37.0550, lng:-76.4878, addr:"100 Museum Dr, Newport News", blurb:"One of the largest maritime museums in North America, home to the USS Monitor Center — and just $1 admission. Surrounded by a free 550-acre park with a 5-mile trail around Mariners' Lake.", hours:"Daily 9:00–17:00", phone:"+1 757-596-2222", rating:4.8, reviewCount:101 },
  { id:"virginia-air-space-center", name:"Virginia Air & Space Science Center", cat:"attraction", dist:9.11, lat:37.023944, lng:-76.344498, addr:"600 Settlers Landing Rd, Hampton", blurb:"The official visitor center for NASA's Langley Research Center — the Apollo 12 Command Module, a genuine moon rock, 30+ historic aircraft, and a 3D IMAX theater. One of only 12 official NASA visitor centers in the country.", hours:"Mon–Fri 10:00–17:00 · Sun 12:00–17:00 · Closed Sat", phone:"+1 757-727-0900", rating:4.5, reviewCount:0 },
  { id:"childrens-museum-of-virginia", name:"Children's Museum of Virginia", cat:"attraction", dist:12.48, lat:36.8349, lng:-76.2988, addr:"221 High St, Portsmouth", blurb:"The largest children's museum in the state, right in historic Olde Towne Portsmouth — a life-size tugboat, a real fire truck cab, a planetarium, and one of the East Coast's biggest antique toy and model train collections.", hours:"Tue–Sun 9:00–16:00 · Closed Mon", phone:"+1 757-393-5258", rating:4.5, reviewCount:154 },
  { id:"great-dismal-swamp", name:"Great Dismal Swamp National Wildlife Refuge", cat:"attraction", dist:42.30, lat:36.58333, lng:-76.45000, addr:"Refuge headquarters, Suffolk/Chesapeake", blurb:"112,000 acres of forested wetlands spanning Chesapeake and Suffolk, with 40+ miles of trails around Lake Drummond — a genuine stop on the Underground Railroad, and free to explore. Great for hiking, birding, and kayaking.", hours:"Trails: daily, sunrise–sunset · Office: Mon–Fri 8:00–16:00", phone:null, rating:4.6, reviewCount:0 },

  // Religious
  { id:"navsta-norfolk-chapel", name:"Naval Station Norfolk Chapel Complex", cat:"religious", dist:0.78, lat:36.94673, lng:-76.31858, addr:"1530 Gilbert St (just inside Gate 2), Norfolk", blurb:"An on-base, multi-faith chapel complex — Our Lady of Victory Chapel (Catholic), David Adams Memorial Chapel (Protestant), the Commodore Uriah P. Levy Chapel (the Navy's oldest Jewish chapel), and Masjid al Da'wah Mosque, all under one roof.", hours:"Catholic Mass Sun 09:30 & Wed 11:30 · Protestant Sun 10:30 · Jewish Shabbat Fri 11:45 · Islamic Prayers Fri 13:00", phone:"+1 757-444-7361", rating:4.5, reviewCount:0 },

  // Community
  { id:"fleet-family-support-center", name:"Fleet & Family Support Center", cat:"community", dist:6.68, lat:36.887, lng:-76.303, addr:"7928 14th St, Bldg SDA-344, Norfolk", blurb:"A genuinely useful, free one-stop resource for military families — relocation help, deployment support, financial counseling, new parent support, and employment assistance, all in one place.", hours:"Mon–Fri 8:00–16:00", phone:"+1 757-444-2102", rating:4.4, reviewCount:0 },

  // Legal
  { id:"naval-legal-service-office", name:"Naval Legal Service Office Mid-Atlantic", cat:"legal", dist:0.46, lat:36.947, lng:-76.315, addr:"Bldg A-50, 9620 Maryland Ave, Naval Station Norfolk", blurb:"On-base legal assistance for service members and families — wills, powers of attorney, notary services, and general legal questions, on a walk-in basis.", hours:"Mon–Thu 07:45–11:45 & 12:45–15:45 · Fri 09:00–12:45", phone:"+1 757-341-4489", rating:3.9, reviewCount:0 },

  // Tailoring & Dry Cleaning
  { id:"aj-alterations-cleaners", name:"A & J Alterations & Cleaners", cat:"tailor", dist:10.01, lat:36.858, lng:-76.291, addr:"4117 Granby St, Norfolk", blurb:"A genuinely well-regarded alterations and dry cleaning shop with real military experience — uniform patches, hems, and formalwear alterations done right.", hours:"Mon–Fri 9:00–18:00 · Sat 9:00–16:30 · Closed Sun", phone:"+1 757-625-3031", rating:4.5, reviewCount:12 },

  // Storage
  { id:"public-storage-w35th", name:"Public Storage (W 35th St)", cat:"storage", dist:7.19, lat:36.885, lng:-76.286, addr:"1090 W 35th St, Norfolk", blurb:"Conveniently located near Hampton Blvd and I-64 — a range of unit sizes, popular with military families needing flexible short-term storage around a move or deployment.", hours:"Office: Mon–Fri 9:30–18:00 · Sat 9:30–17:00 · Sun 11:00–17:00", phone:null, rating:3.6, reviewCount:0 },

  // Farmers Market
  { id:"riverview-village-farmers-market", name:"Riverview Village Day's Farmers' Market", cat:"farmers", dist:7.99, lat:36.87852, lng:-76.281973, addr:"3500 Granby St, Norfolk", blurb:"Described as the area's largest open-air farmers' market — 65+ vendors selling produce, honey, eggs, plants, and crafts, held twice monthly.", hours:"2nd & 4th Sundays, April–December, 11:00–16:00", phone:"+1 757-752-4316", rating:4.5, reviewCount:0 },

  // More Museums & Attractions
  { id:"casemate-museum-fort-monroe", name:"Casemate Museum at Fort Monroe", cat:"museum", dist:6.24, lat:37.0028, lng:-76.3057, addr:"20 Bernard Rd, Fort Monroe, Hampton", blurb:"Free museum inside America's largest stone fort — walk through the actual casemates, including the cell where Confederate president Jefferson Davis was imprisoned. Requires a free timed-entry ticket from the Visitor & Education Center.", hours:"Wed–Sun 10:00–16:00 · Closed Mon/Tue", phone:"+1 757-690-8181", rating:4.6, reviewCount:38 },

  // Car Dealers
  { id:"priority-ford-norfolk", name:"Priority Ford", cat:"cars", dist:11.01, lat:36.885, lng:-76.213, addr:"3420 N Military Hwy, Norfolk", blurb:"A full-service Ford dealership with new and used inventory, plus a service and parts department for routine maintenance and repairs.", hours:"Mon–Fri 9:00–20:00 · Sat 9:00–18:00 · Sun 12:00–17:00", phone:"+1 757-255-8935", rating:4.2, reviewCount:180 },

  // Education
  { id:"tcc-norfolk-campus", name:"Tidewater Community College – Norfolk Campus", cat:"education", dist:10.80, lat:36.851, lng:-76.290, addr:"300 Granby St, Norfolk", blurb:"An affordable, accessible option for continuing education or a degree while stationed here — commonly used with Tuition Assistance, and one of four TCC campuses across Hampton Roads.", hours:"Mon–Tue 8:30–18:30 · Wed–Fri 8:30–17:00", phone:"+1 757-822-1110", rating:3.9, reviewCount:0 },

  // Notary & Shipping
  { id:"ups-store-ghent", name:"The UPS Store (Ghent)", cat:"notary", dist:8.00, lat:36.876, lng:-76.294, addr:"520 W 21st St, Norfolk", blurb:"Locally owned and operated — shipping, printing, mailbox rental, and notary services, right in the heart of Ghent next to Starbucks.", hours:"Open 7 days — check store for daily hours", phone:"+1 757-626-1766", rating:4.3, reviewCount:0 },

  // Bars
  { id:"the-ghent-rooftop-bar", name:"The Ghent Rooftop Bar", cat:"bars", dist:8.00, lat:36.876, lng:-76.294, addr:"319 W 21st St Suite A, Norfolk", blurb:"A genuinely fun, self-pour taphouse and rooftop lounge — activate a pour card and serve yourself beer, wine, and cocktails at your own pace, with fire pits and heaters for cooler nights.", hours:"Wed–Fri 17:00–22:00 · Sat 12:00–22:00 · Sun 12:00–21:00 · Closed Mon/Tue", phone:"+1 757-647-4820", rating:4.4, reviewCount:72 },
];

const catLabels = { restaurant:"Restaurant", grocery:"Grocery", attraction:"Attraction", auto:"Auto", health:"Health", banking:"Banking", housing:"Housing", pets:"Pet Services", fitness:"Fitness", religious:"Religious", shopping:"Shopping", storage:"Storage", museum:"Museum", outdoors:"Outdoors", kids:"Kids", farmers:"Farmers Market", phone:"Phone/Internet", cars:"Car Dealer", tailor:"Tailoring", furniture:"Furniture", legal:"Legal", education:"Education", schools:"Schools", community:"Community", bars:"Bar", services:"Base Services", rec:"Recreation", tattoo:"Tattoo Shop", notary:"Notary/Shipping", beaches:"Beaches", historic:"Historic Triangle Day Trips" };
