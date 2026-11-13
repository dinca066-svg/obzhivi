import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const secretFile=resolve('.dev.vars');
const args=['--import',resolve('scripts/sites-env.mjs'),resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--inspector-port','0'];
// Wrangler resolves env files against its generated config directory. Use an absolute
// path without copying a secret into dist, which is included in deployment archives.
if(existsSync(secretFile))args.push('--env-file',secretFile);
args.push(...process.argv.slice(2));
const child=spawn(process.execPath,args,{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
