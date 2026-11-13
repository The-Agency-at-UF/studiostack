import type {EquipmentCategory} from '../../types/database-api'
/** A readable label code such as CAM-7KQ2; unambiguous characters only so it can be typed from a printed tag. */
export function generatedEquipmentCode(category:EquipmentCategory,random=()=>Math.random()){const prefix=category.replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase(),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return `${prefix}-${Array.from({length:4},()=>alphabet[Math.floor(random()*alphabet.length)]).join('')}`}
