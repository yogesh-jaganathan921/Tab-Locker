let popupOn = false;
let primaryTabURL = null;

chrome.runtime.onMessage.addListener((obj,sender,response) => {
    const { type, title, url } = obj;

    if(type=="tabSwitched"){
        if(url != primaryTabURL){

        }
    }
})

function startCountdown(){
    
}