// Public calendars checked every morning (verified Nov 2026). format: "ics" (iCalendar) or "tribe"
// (WordPress The Events Calendar). allDog: true keeps every event (dog organizations); otherwise
// only dog-related ones are kept. Most local venues and city sites don't publish a usable feed;
// those events come in through reader submissions or get added by hand in /admin/.
export const SOURCES = [
  { id: "cumming-city-center", name: "Cumming City Center", format: "tribe", town: "Cumming",
    url: "https://cummingcitycenter.com/wp-json/tribe/events/v1/events", page: "https://cummingcitycenter.com/events/" },
  { id: "atlanta-humane", name: "Atlanta Humane Society", format: "tribe", allDog: true,
    url: "https://atlantahumane.org/wp-json/tribe/events/v1/events", page: "https://atlantahumane.org/events/" },
  { id: "chicopee-ag-center", name: "Chicopee Woods Ag Center", format: "ics", town: "Gainesville",
    url: "https://www.hallcounty.org/common/modules/iCalendar/iCalendar.aspx?feed=calendar&catID=72", page: "https://www.hallcounty.org/calendar.aspx?CID=72" },
];
