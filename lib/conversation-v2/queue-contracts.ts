import {z} from "zod";
import {conversationStateV2Schema,type ConversationStateV2} from "./schema";

export const CONVERSATION_V2_CAS_MAX_RETRIES=3;
export const CONVERSATION_V2_LEASE_MS=60_000;
export const CONVERSATION_V2_ORDERING_GRACE_MS=250;

export const queueJobStatusV2Schema=z.enum(["received","ready","processing","deferred","completed","failed_recoverable","failed_terminal"]);
export type QueueJobStatusV2=z.infer<typeof queueJobStatusV2Schema>;
export type QueueJobV2={id:string;organizationId:string;conversationKey:string;externalMessageId:string;receivedAt:string;createdAt:string;payload:unknown;status:QueueJobStatusV2;attempts:number;availableAt:string;processingStartedAt:string|null;completedAt:string|null;ownerToken:string|null;leaseExpiresAt:string|null;errorCode:string|null;stateRevision:number|null};
export type LeaseV2={conversationKey:string;ownerToken:string;acquiredAt:string;expiresAt:string};
export type QueueTelemetryV2={conversationKeyHash:string;externalMessageIdMasked:string;jobId:string;receivedAt:string;processingStartedAt:string|null;revisionBefore:number|null;revisionAfter:number|null;casConflict:boolean;retryAttempt:number;lockWaitMs:number;processingDurationMs:number;finalStatus:QueueJobStatusV2};
export type QueueTransitionV2=(state:ConversationStateV2,job:QueueJobV2)=>Promise<ConversationStateV2>|ConversationStateV2;

export interface ConversationQueueStoreV2{
  enqueue(job:Omit<QueueJobV2,"status"|"attempts"|"availableAt"|"processingStartedAt"|"completedAt"|"ownerToken"|"leaseExpiresAt"|"errorCode"|"stateRevision">,graceMs:number):Promise<"created"|"duplicate">;
  acquireLease(conversationKey:string,ownerToken:string,now:string,leaseMs:number):Promise<boolean>;
  renewLease(conversationKey:string,ownerToken:string,now:string,leaseMs:number):Promise<boolean>;
  releaseLease(conversationKey:string,ownerToken:string):Promise<boolean>;
  claimNext(conversationKey:string,ownerToken:string,now:string):Promise<QueueJobV2|null>;
  loadState(conversationKey:string):Promise<ConversationStateV2>;
  commitTransition(input:{conversationKey:string;ownerToken:string;jobId:string;expectedRevision:number;nextState:ConversationStateV2;now:string}):Promise<"committed"|"cas_conflict"|"lease_lost"|"already_completed">;
  defer(jobId:string,ownerToken:string,availableAt:string,errorCode:string):Promise<void>;
  fail(jobId:string,ownerToken:string,terminal:boolean,errorCode:string,now:string):Promise<void>;
  recover(now:string):Promise<number>;
  listConversationKeysWithWork(now:string):Promise<string[]>;
  getJob(externalMessageId:string):Promise<QueueJobV2|undefined>;
}

export function assertMonotonicTransition(before:ConversationStateV2,after:ConversationStateV2,externalMessageId:string){
  conversationStateV2Schema.parse(after);
  if(after.revision<before.revision)throw new Error("CONVERSATION_REVISION_REGRESSION");
  if(after.lastProcessedEvent?.externalMessageId!==externalMessageId)throw new Error("EVENT_CURSOR_MISMATCH");
}
