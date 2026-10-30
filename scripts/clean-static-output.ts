import {rm} from 'node:fs/promises'
import {resolve} from 'node:path'

// Next's build export can retain files from earlier exports. Package only the
// current build, including its matching HTML, Flight data and chunk references.
await rm(resolve('out'), {recursive:true,force:true})
