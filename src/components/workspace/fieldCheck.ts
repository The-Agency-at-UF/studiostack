import {emailPattern} from '../../types/patterns'

// Forms check their own fields (with noValidate) so mistakes show next to the field in our UI, not in a browser bubble.

/** One check for the form control with this `name`. Rules run in order; the first that fails is shown. */
export type FieldRule<F extends string>={field:F;fails:(input:HTMLInputElement)=>boolean;message:string}
export type FieldProblem<F extends string>={field:F;message:string}

/** Returns the first broken field and moves focus to it, so the person lands right on what to fix. */
export function firstProblem<F extends string>(form:HTMLFormElement,rules:FieldRule<F>[]):FieldProblem<F>|null{
  for(const rule of rules){
    const input=form.elements.namedItem(rule.field) as HTMLInputElement|null
    if(input&&rule.fails(input)){input.focus();return {field:rule.field,message:rule.message}}
  }
  return null
}

/** Props that mark a field invalid and point it at its message, whose id is `${prefix}-${field}-error`. */
export function invalidProps<F extends string>(problem:FieldProblem<F>|null,field:F,prefix:string){
  return problem?.field===field?{'aria-invalid':true as const,'aria-describedby':`${prefix}-${field}-error`}:{}
}

export const isBlank=(input:{value:string})=>!input.value.trim()

/**
 * Fails unless the value is a whole number from `min` to `max`. A blank value passes only when `optional`.
 * `badInput` catches text a number field can't read, which the browser would otherwise report as blank.
 */
export const notWholeNumber=(min:number,max:number,{optional=false}:{optional?:boolean}={})=>(input:HTMLInputElement)=>{
  const value=input.value.trim()
  if(input.validity?.badInput)return true
  if(!value)return !optional
  return !/^\d+$/.test(value)||Number(value)<min||Number(value)>max
}

/** A rough shape check; the server still decides whether the address is acceptable. */
export const notEmail=(input:{value:string})=>!emailPattern.test(input.value.trim())
