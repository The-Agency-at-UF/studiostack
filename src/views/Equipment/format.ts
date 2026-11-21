/** Equipment dates and times read the same everywhere, e.g. "Fri, Nov 20, 10:00 AM", without seconds. */
export const dateTimeLabel=(value:string|number|Date)=>new Date(value).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
