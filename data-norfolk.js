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
];

const catLabels = { restaurant:"Restaurant", grocery:"Grocery", attraction:"Attraction", auto:"Auto", health:"Health", banking:"Banking", housing:"Housing", pets:"Pet Services", fitness:"Fitness", religious:"Religious", shopping:"Shopping", storage:"Storage", museum:"Museum", outdoors:"Outdoors", kids:"Kids", farmers:"Farmers Market", phone:"Phone/Internet", cars:"Car Dealer", tailor:"Tailoring", furniture:"Furniture", legal:"Legal", education:"Education", schools:"Schools", community:"Community", bars:"Bar", services:"Base Services", rec:"Recreation", tattoo:"Tattoo Shop", notary:"Notary/Shipping", beaches:"Beaches", historic:"Historic Triangle Day Trips" };
