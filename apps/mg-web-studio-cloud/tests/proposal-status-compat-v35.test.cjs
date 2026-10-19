"use strict";
/* V35/C02 — V13/V20 proposal status reconciliation; all in memory.
 * node apps/mg-web-studio-cloud/tests/proposal-status-compat-v35.test.cjs
 * No database, HTTP, real auth, SQL execution or deployment.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const win={};
for(const name of ["mg-contracts-v20.js","mg-proposal-status-compat-v35.js","mg-sql-api-compat-v21.js"])
 new Function("window",read("shared/"+name))(win);
const C=win.MGWebContractsV20,V=win.MGProposalStatusCompatV35,Q=win.MGSqlApiCompatV21;
let n=0;const yes=(label,b)=>{assert.ok(b,label);n++},copy=x=>JSON.parse(JSON.stringify(x));
const noGo=x=>x.go===false&&x.simulationOnly===true&&x.mayWrite===false&&x.mayRunSQL===false&&x.mayPublish===false;
const core=read("db/schema_core.review.sql"),sql=read("db/v13-propuestas-scopes.review.sql"),api=read("shared/mg-contracts-v20.js");
yes("version 35",V.version==="35.0-review");
yes("exact six canonical states",JSON.stringify(V.canonicalStates)===JSON.stringify(
 ["draft","submitted","needs_changes","rejected","approved","applied"]));
yes("exact six legacy SQL states",JSON.stringify(V.legacyStates)===JSON.stringify(
 ["draft","submitted_for_review","needs_changes","rejected","approved","applied_to_draft"]));
yes("exact legacy aliases",V.legacyAliases.submitted_for_review==="submitted"&&V.legacyAliases.applied_to_draft==="applied");
yes("V20 agrees on statuses",JSON.stringify(V.canonicalStates)===JSON.stringify(C.STATUSES));
yes("events distinct from statuses",V.eventTypes.includes("changes")&&!V.canonicalStates.includes("changes"));
yes("review decisions distinct",JSON.stringify(V.reviewDecisions)===JSON.stringify(["approved","changes","rejected"]));
for(const [src,dest,legacy,old] of [
 ["draft","draft",false,"draft"],
 ["submitted_for_review","submitted",true,"submitted_for_review"],
 ["submitted","submitted",false,"submitted_for_review"],
 ["needs_changes","needs_changes",false,"needs_changes"],
 ["rejected","rejected",false,"rejected"],
 ["approved","approved",false,"approved"],
 ["applied_to_draft","applied",true,"applied_to_draft"],
 ["applied","applied",false,"applied_to_draft"]]){
 const r=V.normalize(src,C);
 yes("normalize "+src,r.ok&&r.status===dest&&r.wasLegacy===legacy);
 yes("rollback label "+src,r.legacyStorageLabel===old);
 yes("write proposal label "+src,r.canonicalStorageLabel===dest);
 yes("never writes "+src,noGo(r)&&r.writeRequiresVerifiedMigration);
}
for(const status of ["","Submitted","SUBMITTED","changes","proposal_submitted","published",
 "archived","submitted_for_review "," applied ",null,42,{},[]]){
 const res=V.normalize(status,C);
 yes("unknown "+String(status)+" rejected",!res.ok);
 yes("unknown "+String(status)+" fail closed",noGo(res));
}
yes("missing V20 normalizer blocked",V.normalize("draft",null).code==="STATUS_OR_CONTRACT_REQUIRED");
const fixture=[
 {id:"proposal1",organizationId:"orgA",siteId:"siteA",revision:1,status:"submitted_for_review",note:"sensitive body"},
 {id:"proposal2",organizationId:"orgA",siteId:"siteA",revision:2,status:"applied_to_draft"},
 {id:"proposal3",organizationId:"orgB",siteId:"siteB",revision:1,status:"approved"},
 {id:"proposal4",organizationId:"orgB",siteId:"siteC",revision:3,status:"draft"}
];
const before=JSON.stringify(fixture),report=V.inspectFixture(fixture,C);
yes("fixture mapping success",report.ok);
yes("two legacy records",report.legacyCount===2);
yes("two canonical records",report.canonicalCount===2);
yes("four status records inspected",report.rowsInspected===4);
yes("count submitted",report.counts.submitted===1);
yes("count applied",report.counts.applied===1);
yes("count approved",report.counts.approved===1);
yes("count draft",report.counts.draft===1);
yes("report never changes real DB",report.recordsConvertedInDatabase===0&&!report.changesApplied);
yes("status mapping keeps tenant",report.rows[0].organizationId==="orgA"&&report.rows[2].organizationId==="orgB");
yes("status mapping keeps revisions",report.rows[1].revision===2);
yes("source remains unchanged",before===JSON.stringify(fixture));
yes("redact proposal body from summaries",!JSON.stringify(report).includes("sensitive body"));
report.rows[0].canonicalStatus="rejected";
yes("source not shared by reference",fixture[0].status==="submitted_for_review");
const malformed=[
 ["not array",null,"INVALID_FIXTURE"],
 ["string", "x","INVALID_FIXTURE"],
 ["over max",Array(1001).fill(fixture[0]),"INVALID_FIXTURE"],
 ["duplicate proposal",[fixture[0],fixture[0]],"DUPLICATE_PROPOSAL"],
 ["missing id",[{...fixture[0],id:""}],"INVALID_PROPOSAL_ROW"],
 ["missing tenant",[{...fixture[0],organizationId:undefined}],"INVALID_PROPOSAL_ROW"],
 ["missing site",[{...fixture[0],siteId:null}],"INVALID_PROPOSAL_ROW"],
 ["zero revision",[{...fixture[0],revision:0}],"INVALID_PROPOSAL_ROW"],
 ["fractional revision",[{...fixture[0],revision:1.5}],"INVALID_PROPOSAL_ROW"],
 ["invalid state",[{...fixture[0],status:"changes"}],"UNRECOGNIZED_PROPOSAL_STATUS"],
 ["missing status",[{...fixture[0],status:undefined}],"UNRECOGNIZED_PROPOSAL_STATUS"]
];
for(const [name,rows,code] of malformed){
 const res=V.inspectFixture(rows,C);
 yes(name+" detected",res.code===code);
 yes(name+" no GO",noGo(res));
}
const rel={review:[{decision:"changes",revision:1},{decision:"approved",revision:2}],
 outbox:[{eventType:"submitted",revision:1},{eventType:"changes",revision:1},{eventType:"applied",revision:2}],
 notifications:[{eventType:"rejected",revision:1}]};
const types=V.verifyRelatedTypes(rel.review,rel.outbox,rel.notifications);
yes("related types accepted",types.ok&&types.separateStatusAndEvents);
yes("reviews not statuses",types.decisionToState.changes==="needs_changes");
yes("notifications untouched",types.eventTypes.includes("changes"));
yes("relation counts",types.totals.reviews===2&&types.totals.outbox===3&&types.totals.notifications===1);
yes("related verification is read only",noGo(types));
const badTypes=[
 ["invalid reviews",[{decision:"needs_changes",revision:1}],rel.outbox,rel.notifications,"UNKNOWN_REVIEW_DECISION"],
 ["unknown review",[{}],rel.outbox,rel.notifications,"UNKNOWN_REVIEW_DECISION"],
 ["bad review revision",[{decision:"approved",revision:0}],rel.outbox,rel.notifications,"UNKNOWN_REVIEW_DECISION"],
 ["outbox status as event",rel.review,[{eventType:"needs_changes",revision:1}],rel.notifications,"UNKNOWN_OUTBOX_EVENT"],
 ["outbox unlisted",rel.review,[{eventType:"proposal_created",revision:1}],rel.notifications,"UNKNOWN_OUTBOX_EVENT"],
 ["bad notification",rel.review,rel.outbox,[{eventType:"applied_to_draft",revision:1}],"UNKNOWN_NOTIFICATION_EVENT"],
 ["notifications unknown",rel.review,rel.outbox,[{eventType:"proposal_revised",revision:1}],"UNKNOWN_NOTIFICATION_EVENT"],
 ["missing review list",null,rel.outbox,rel.notifications,"INVALID_RELATED_FIXTURE"]
];
for(const [name,r,o,notif,code] of badTypes)
 yes(name+" denied",V.verifyRelatedTypes(r,o,notif).code===code);
const existing=V.checkV13(sql);
yes("existing schema recognized",existing.ok&&existing.valid);
yes("V13 mismatch still exists",existing.statusContractMismatch&&existing.migrationApplied===false);
yes("V13 statically scanned not parsed",!existing.parserVerified&&!existing.sqlExecuted);
yes("legacy SQL exact",JSON.stringify(existing.found.states)===JSON.stringify(V.legacyStates));
yes("review CHECK exact",JSON.stringify(existing.found.decisions)===JSON.stringify(V.reviewDecisions));
yes("notification CHECK exact",JSON.stringify(existing.found.notices)===JSON.stringify(V.eventTypes));
yes("outbox CHECK exact",JSON.stringify(existing.found.outbox)===JSON.stringify(V.eventTypes));
yes("six schema invariants confirmed",Object.values(existing.checks).every(Boolean));
yes("review static no GO",noGo(existing));
const sqlMutations=[
 ["proposal statuses", s=>s.replace("'submitted_for_review'","'submitted'"),"legacyProposalStates"],
 ["reviews",s=>s.replace("decision in ('approved','changes','rejected')","decision in ('approved','needs_changes','rejected')"),"reviewDecisionTypes"],
 ["notification events",s=>s.replace("event_type in ('submitted','approved','changes','rejected','applied')","event_type in ('submitted','approved','needs_changes','rejected','applied')"),"notificationEventTypes"],
 ["outbox events",s=>s.replaceAll("event_type in ('submitted','approved','changes','rejected','applied')","event_type in ('submitted','approved','changes','rejected','applied','proposal_created')"),"outboxEventTypes"],
 ["missing proposals table",s=>s.replace("create table public.mg_site_proposals","create table public.mg_missing_proposals"),"legacyProposalStates"],
 ["missing review table",s=>s.replace("create table public.mg_proposal_reviews","create table public.mg_missing_reviews"),"reviewDecisionTypes"],
 ["missing notice table",s=>s.replace("create table public.mg_proposal_notifications","create table public.mg_missing_notifications"),"notificationEventTypes"],
 ["missing outbox table",s=>s.replace("create table mg_private.mg_proposal_outbox","create table mg_private.mg_missing_outbox"),"outboxEventTypes"]
];
for(const [name,fn,flag] of sqlMutations){
 const x=V.checkV13(fn(sql));
 yes(name+" schema drift detected",!x.valid&&!x.checks[flag]);
 yes(name+" does not execute",noGo(x));
}
const commentNoise=V.checkV13("-- event_type in ('submitted','needs_changes')\n"+sql);
yes("commented SQL not treated as schema",commentNoise.valid);
const w1=V.projectWriteStatus("submitted_for_review","legacy-v13-proposed",C);
yes("legacy target writes legacy label only as plan",w1.ok&&w1.proposedStatus==="submitted_for_review");
const w2=V.projectWriteStatus("submitted_for_review","canonical-v20-proposed",C);
yes("future canonical target writes canonical label only as plan",w2.ok&&w2.proposedStatus==="submitted");
yes("write target never verified",w2.actualTargetVerified===false&&w2.realWritesPerformed===0);
yes("canonical write requires versioned migration",w2.requiresVersionedMigration);
for(const x of ["legacy-v13-proposed","canonical-v20-proposed"]){
 for(const sourceStatus of V.canonicalStates){
  const proposed=V.projectWriteStatus(sourceStatus,x,C);
  yes(x+" projects "+sourceStatus,proposed.ok&&typeof proposed.proposedStatus==="string"&&noGo(proposed));
 }
}
for(const name of ["verified-real-database","production","",null,42])
 yes("unverified target "+String(name)+" rejected",V.projectWriteStatus("draft",name,C).code==="UNVERIFIED_TARGET_CONTRACT");
yes("invalid write status rejected",V.projectWriteStatus("changes","canonical-v20-proposed",C).code==="INVALID_STATUS");
const owner={kind:"client",role:"CLIENT_OWNER",active:true,aal:"aal1"};
const editor={kind:"client",role:"CLIENT_EDITOR",active:true,aal:"aal1"};
const staff={kind:"staff",role:"SUPERADMIN",active:true,aal:"aal2"};
const scope={organizationId:"orgA",level:"all",siteIds:[]};
const requested=(action,status,actor=owner,extra={})=>({
 action,status,actor,scope,organizationId:"orgA",siteId:"siteA",
 currentRevision:1,expectedRevision:1,currentDraftVersion:1,expectedDraftVersion:1,
 note:"Solicitamos cambiar detalles visibles antes de aprobar la propuesta.",
 contracts:C,...extra
});
const approved=V.reviewTransition(requested("approve","submitted_for_review"));
yes("approve legacy submitted",approved.ok&&approved.from==="submitted"&&approved.to==="approved");
yes("approved emits event approved",approved.relatedEvent==="approved");
yes("approved no publish",approved.notPublished&&noGo(approved)&&!approved.actualAuthorization);
const changed=V.reviewTransition(requested("changes","submitted_for_review",editor,
 {scope:{organizationId:"orgA",level:"selected",siteIds:["siteA"]}}));
yes("changes legacy submitted",changed.ok&&changed.to==="needs_changes");
yes("changes emits 'changes' not needs_changes",changed.relatedEvent==="changes");
const applied=V.reviewTransition(requested("apply","approved"));
yes("apply approved",applied.ok&&applied.to==="applied"&&applied.relatedEvent==="applied");
yes("apply is not publish",applied.notPublished&&noGo(applied));
const revise=V.reviewTransition(requested("revise","rejected",staff));
yes("revise rejected",revise.ok&&revise.to==="draft"&&revise.revision===2);
yes("revise has no V13 event type",revise.relatedEvent===null);
const unsafeTransitions=[
 ["viewer approve",requested("approve","submitted", {kind:"client",role:"CLIENT_VIEWER",active:true,aal:"aal1"}),"FORBIDDEN"],
 ["owner bad state",requested("approve","draft"),"INVALID_TRANSITION"],
 ["editor approve",requested("approve","submitted",editor),"FORBIDDEN"],
 ["stale revision",requested("approve","submitted",owner,{expectedRevision:2}),"STALE_REVISION"],
 ["invalid legacy",requested("approve","submittedX"),"INVALID_STATUS"],
 ["owner no scope",requested("approve","submitted",owner,{scope:null}),"SCOPE_DENIED"]
];
for(const [name,payload,code] of unsafeTransitions){
 const r=V.reviewTransition(payload);
 yes(name+" rejected",r.code===code);
 yes(name+" no GO",noGo(r));
}
const V21=Q.audit({core,proposals:sql,api});
yes("V21 remains mismatched",V21.issues.some(x=>x.code==="STATUS_CONTRACT_MISMATCH"));
yes("V21 SQL not changed",V21.sqlStates.includes("applied_to_draft")&&!V21.sqlStates.includes("applied"));
const reviewSQL=read("db/v35-estados-propuestas.review.sql");
yes("V35 SQL review long enough",reviewSQL.length>2500);
yes("every SQL file line comment-only",reviewSQL.split(/\r?\n/).every(x=>!x.trim()||x.trim().startsWith("--")));
for(const token of ["NO EJECUTAR","submitted_for_review -> submitted","applied_to_draft     -> applied",
 "changes es EVENTO","NO ampliar enums","ROLLBACK","RLS","SECURITY DEFINER"]){
 yes("SQL review includes "+token,reviewSQL.toUpperCase().includes(token.toUpperCase()));
}
const roadmap=JSON.parse(read("staging/v33-master-roadmap.review.json"));
yes("C02 independent pending documentation",roadmap.tasks.find(x=>x.id==="C02").status==="READY_FOR_GITHUB_WORK");
yes("C03 still blocked on C01 C02",JSON.stringify(roadmap.tasks.find(x=>x.id==="C03").deps)===JSON.stringify(["C01","C02"]));
const v18=JSON.parse(read("staging/v18-manifest.review.json"));
yes("V18 remains not authorized",v18.state==="NOT_AUTHORIZED"&&v18.authorization.granted===false);
yes("V18 16 pending",v18.checks.length===16&&v18.checks.every(x=>x.status==="pending"));
yes("module no fetch",!read("shared/mg-proposal-status-compat-v35.js").includes("fetch("));
yes("module no Supabase",!read("shared/mg-proposal-status-compat-v35.js").includes("supabase."));
yes("module no eval",!read("shared/mg-proposal-status-compat-v35.js").includes("eval("));
console.log(n+" / "+n+" V35 simulated status compatibility checks passed — NO GO.");
