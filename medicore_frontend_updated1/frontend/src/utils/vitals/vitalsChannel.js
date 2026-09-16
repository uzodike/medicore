const channel = new BroadcastChannel('vitals-channel')

export const sendVitals = (vitals) => {
    channel.postMessage(vitals)
}

export const onVitalsReceived = (callback) => {
    channel.onmessage = (event) => callback(event.data)
}
