const { axiosInstanace } = require("./axios");

function sendMessage(messageObj, messageText) {
    return axiosInstanace.get("sendMessage", {
        chat_id: messageObj.chat.id,
        text: messageText,
    });
}

function handleMessage(messageObj){
    const messageText = messageObj.text || "";
    if (messageText.charAt(0)==="/") {
        const command = messageText.substring(1);
        switch(command) {
            case "start":
                return sendMessage(messageObj, "Welcome to the bot! Type /help for assistance.");
            default:
                return sendMessage(messageObj, `Unknown command: ${command}. Type /help for assistance.`);
        
        }
    }else {
    //we can send same message back to the user
    return sendMessage(messageObj, `You said: ${messageText}`);
}}

module.exports = { handleMessage };