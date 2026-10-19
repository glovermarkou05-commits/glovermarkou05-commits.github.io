"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const window={};new Function("window",read("shared/mg-migration-simulator-v22.js"))(window);
const m=window.MGMigrationSimulatorV22;let n=0;const t=(ok,name)=>{assert.ok(ok,name);n++};
const fixture=()=>({pages:[{siteId:"s1",slug:""},{siteId:"s1",slug:"contacto"}],proposals:[{id:"p1",status:"submitted_for_review",revision:1},{id:"p2",status:"applied_to_draft",revision:4}]});
const source=fixture(),ops=[{type:"normalizeHome",siteId:"s1"},{type:"normalizeStatuses"},{type:"compareAndSwap",id:"p1",expectedStatus:"submitted",expectedRevision:1,nextStatus:"approved"}];
let r=m.simulate(source,ops);
t(r.ok,"Rehearsal succeeds");t(r.committed,"Atomic simulated commit");t(r.state.pages[0].slug==="home","Home");t(r.state.proposals[0].status==="approved","Status");t(r.state.proposals[0].revision===2,"CAS version");t(r.state.proposals[1].status==="applied","Legacy applied");t(r.originalUnchanged,"Original unchanged");t(source.pages[0].slug==="","No original mutation");t(!r.go&&!r.sqlExecuted&&!r.productionReady,"No GO");
for(const [name,fixtureData,steps,code] of [
 ["Missing Home",{pages:[{siteId:"s1",slug:"contacto"}],proposals:[]},[{type:"normalizeHome",siteId:"s1"}],"HOME_CARDINALITY"],
 ["Duplicate Home",{pages:[{siteId:"s1",slug:""},{siteId:"s1",slug:"home"}],proposals:[]},[{type:"normalizeHome",siteId:"s1"}],"HOME_CARDINALITY"],
 ["Missing proposal",fixture(),[{type:"compareAndSwap",id:"absent",expectedRevision:1}],"PROPOSAL_NOT_FOUND"],
 ["Stale revision",fixture(),[{type:"compareAndSwap",id:"p1",expectedStatus:"submitted_for_review",expectedRevision:0,nextStatus:"approved"}],"STALE_REVISION"],
 ["Stale state",fixture(),[{type:"compareAndSwap",id:"p1",expectedStatus:"draft",expectedRevision:1,nextStatus:"approved"}],"STALE_STATUS"],
 ["Unknown status",fixture(),[{type:"normalizeStatuses"},{type:"compareAndSwap",id:"p1",expectedStatus:"submitted",expectedRevision:1,nextStatus:"alien"}],"UNKNOWN_STATUS"],
 ["Unknown action",fixture(),[{type:"publish"}],"UNKNOWN_OPERATION"],
 ["Atomic rollback",fixture(),[...ops,{type:"publish"}],"UNKNOWN_OPERATION"]
]){const x=m.simulate(fixtureData,steps);t(!x.ok&&x.code===code&&!x.committed,name)}
t(m.gate({execution:{dryRunOnly:true,mayRunMigrations:true}}).go===false,"Manifest cannot authorize");
t(!m.gate({execution:{dryRunOnly:true,mayRunMigrations:true}}).mayRunMigrations,"Manifest cannot run SQL");
t(read("shared/mg-migration-simulator-v22.js").includes("sqlExecuted:false"),"No SQL claims");
console.log(n+" / "+n+" V22 simulated checks passed (no SQL executed).");
