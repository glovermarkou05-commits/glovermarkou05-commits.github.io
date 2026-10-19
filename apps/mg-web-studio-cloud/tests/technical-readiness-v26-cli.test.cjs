"use strict";
/* Only simulates Node CLI entrypoints. Does not launch Node, shell, SQL or network. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const cli=read("staging/v26-preflight.cjs");
const fakeModule={exports:{}};
const fakeProcess={exitCode:0};
let checks=0,lines=[];
function ok(label,value){assert.ok(value,label);checks++;}
const fakeRequire=name=>name==="node:fs"?fs:name==="node:path"?path:null;
fakeRequire.main=fakeModule;
new Function("require","__dirname","module","process","console",cli)(
 fakeRequire,path.join(__dirname,"../staging"),fakeModule,fakeProcess,{log:x=>lines.push(x)}
);
ok("Report loaded",!!fakeModule.exports.report);
ok("Read-only valid input",fakeModule.exports.report.validInputs===true);
ok("NO GO",fakeModule.exports.report.decision==="NO_GO");
ok("CLI expected exit 2",fakeProcess.exitCode===2);
ok("Printable NO GO",lines.join("\n").includes("NO GO"));
ok("Publications blocked",fakeModule.exports.report.mayPublish===false);
ok("No shell",!cli.includes("child_process")&&!cli.includes("execSync"));
ok("No database client",!cli.includes("supabase."));
ok("No HTTP",!cli.includes("fetch(")&&!cli.includes("https.request"));
ok("No writes",!cli.includes("writeFileSync")&&!cli.includes("appendFileSync"));
ok("No payment",!cli.includes("stripe.")&&!cli.includes("checkout"));
console.log(checks+" / "+checks+" V26 CLI dry-run checks passed (expected exit code 2).");
