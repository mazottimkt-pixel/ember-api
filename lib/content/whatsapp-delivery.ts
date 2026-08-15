import type { NormalizedOutbound } from "@/lib/channels/contracts";
import { whatsappContentPolicy } from "./channel-policy";
export function buildApprovedContentImageOutput(input:{conversationId:string;signedUrl:string;caption?:string;status:string;mimeType:string;sizeBytes:number;requestId:string}):NormalizedOutbound{
  if(!whatsappContentPolicy().imageSending)throw new Error("WHATSAPP_CONTENT_DISABLED");
  if(input.status!=="approved")throw new Error("CONTENT_NOT_APPROVED");
  if(!["image/png","image/jpeg","image/webp"].includes(input.mimeType))throw new Error("CONTENT_IMAGE_MIME_INVALID");
  if(input.sizeBytes<1||input.sizeBytes>5*1024*1024)throw new Error("CONTENT_IMAGE_SIZE_INVALID");
  return{channel:"whatsapp",conversationId:input.conversationId,kind:"image",mediaReference:input.signedUrl,text:input.caption,metadata:{requestId:input.requestId,contentStatus:"approved"}};
}
