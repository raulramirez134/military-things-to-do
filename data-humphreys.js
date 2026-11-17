const places = [
  // Restaurants & Cafés
  { id:"wolfhound-irish-pub", name:"The Wolfhound Irish Pub", cat:"restaurant", dist:1.18, lat:36.965, lng:127.020, addr:"Anjeong-ri, Paengseong-eup, Pyeongtaek", blurb:"An Irish pub tucked away in the Ville just outside the Walk-through Gate — by far the best weekend brunch near Humphreys, and reportedly the only place in Pyeongtaek pouring mimosas. Try the Irish stew for dinner.", hours:"Check current hours — varies by day", phone:null, rating:4.4, reviewCount:0 },
  { id:"roasters-anjeong", name:"Roasters (Anjeong)", cat:"restaurant", dist:1.12, lat:36.964, lng:127.021, addr:"43 Anjeong-ro, Paengseong-eup, Pyeongtaek", blurb:"A local coffee roaster about half a mile outside the Anjeong-ri gate — they roast their own beans on Tuesdays, so grab a fresh bag then. Cozy enough to work from all day.", hours:"Daily 10:00–23:00", phone:null, rating:4.5, reviewCount:0 },
  { id:"the-cottage-cafe-pyeongtaek", name:"The Cottage Café", cat:"restaurant", dist:1.12, lat:36.964, lng:127.021, addr:"40 Anjeong-ro, Paengseong-eup, Pyeongtaek", blurb:"A genuinely charming cottage-themed café right across from Roasters — specialty drinks like pumpkin spice and butterbeer lattes, books for kids, and plenty of cozy photo spots.", hours:"Mon–Thu 6:00–12:00 · Sat/Sun 10:00–18:00 · Closed Fri", phone:null, rating:4.6, reviewCount:0 },
  { id:"fish-and-chips-anjeongri", name:"Fish & Chips", cat:"restaurant", dist:1.32, lat:36.963, lng:127.019, addr:"Anjeong-ri, Paengseong-eup, Pyeongtaek", blurb:"A top-rated British-style takeaway and dine-in spot — freshly battered cod and shrimp & chips, voted \"Best Fish & Chips\" in Pyeongtaek's 2023 and 2024 community polls.", hours:"Mon–Sun 11:30–20:00 · Closed Mon", phone:null, rating:4.5, reviewCount:0 },

  // Grocery & Food
  { id:"humphreys-commissary", name:"Camp Humphreys Commissary", cat:"grocery", dist:0.42, lat:36.9695, lng:127.0365, addr:"USAG Humphreys (on-post)", blurb:"The installation's one medium-sized commissary — a full grocery selection at commissary pricing for authorized patrons.", hours:"Check current hours — varies by day", phone:null, rating:3.9, reviewCount:0 },

  // Health
  { id:"army-health-clinic-humphreys", name:"U.S. Army Health Clinic – Humphreys", cat:"health", dist:0.41, lat:36.9705, lng:127.0345, addr:"USAG Humphreys (on-post)", blurb:"The on-base clinic for routine and specialty care for active-duty members and eligible dependents. There's no emergency room on post — for a true emergency, dial 119 or go to a local Korean hospital.", hours:"DSN appointments: 315-737-2273", phone:null, rating:3.6, reviewCount:0 },

  // Banking & Money
  { id:"navy-federal-humphreys", name:"Navy Federal Credit Union (Humphreys)", cat:"banking", dist:0.28, lat:36.9685, lng:127.0355, addr:"USAG Humphreys (on-post)", blurb:"One of two on-post financial institutions (alongside Community Bank) — full-service banking for the Humphreys community.", hours:"Check current hours — varies by day", phone:null, rating:3.4, reviewCount:0 },

  // DMZ & History Tours
  { id:"dmz-tour-from-humphreys", name:"DMZ Half-Day Tour (Direct Pickup from Humphreys)", cat:"dmz", dist:0.03, lat:36.9668, lng:127.0328, addr:"Pickup at Camp Humphreys Main Gate", blurb:"A genuinely convenient way to see the DMZ without first traveling to Seoul — round-trip transportation with pickup and drop-off right at the Main Gate. Bring your passport; visitors have described the infiltration-tunnel walk as a highlight.", hours:"Varies by tour operator and booking", phone:null, rating:4.7, reviewCount:0 },

  // Seoul Day Trips
  { id:"myeongdong-shopping", name:"Myeongdong Shopping District", cat:"seoul", dist:66.48, lat:37.5636, lng:126.9834, addr:"Myeongdong, Jung District, Seoul", blurb:"One of Seoul's most famous shopping and street-food districts — a genuinely great full-day trip, easily combined with Gyeongbokgung Palace and Namsan Seoul Tower nearby. Reachable by direct train from Pyeongtaek Station.", hours:"Street market typically 17:00–22:00; shops vary", phone:null, rating:4.5, reviewCount:0 },

  // Korean Culture & Palaces
  { id:"gyeongbokgung-palace", name:"Gyeongbokgung Palace", cat:"culture", dist:68.30, lat:37.5796, lng:126.9770, addr:"161 Sajik-ro, Jongno District, Seoul", blurb:"The largest of Seoul's Five Grand Palaces, built in 1395 as the main royal palace of the Joseon Dynasty — genuinely stunning grounds, with the National Folk Museum of Korea accessible directly from inside. Closed Tuesdays.", hours:"Daily 9:00–17:00 (extended in summer) · Closed Tue", phone:null, rating:4.7, reviewCount:0 },
];

const catLabels = { restaurant:"Restaurant", grocery:"Grocery", attraction:"Attraction", auto:"Auto", health:"Health", banking:"Banking", housing:"Housing", pets:"Pet Services", fitness:"Fitness", religious:"Religious", shopping:"Shopping", storage:"Storage", museum:"Museum", outdoors:"Outdoors", kids:"Kids", farmers:"Farmers Market", phone:"Phone/Internet", cars:"Car Dealer", tailor:"Tailoring", furniture:"Furniture", legal:"Legal", education:"Education", schools:"Schools", community:"Community", bars:"Bar", services:"Base Services", rec:"Recreation", tattoo:"Tattoo Shop", notary:"Notary/Shipping", language:"Language Schools", pcs:"PCS & Household Goods", seoul:"Seoul Day Trips", dmz:"DMZ & History Tours", culture:"Korean Culture & Palaces" };
