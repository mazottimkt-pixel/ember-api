export function whatsappContentPolicy(){const enabled=process.env.WHATSAPP_CONTENT_FLOWS_ENABLED==="true";return{navigation:true,textGeneration:enabled,imageGeneration:enabled,imageSending:enabled};}
