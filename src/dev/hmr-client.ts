const connect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/.bunact/hmr`)

    ws.addEventListener('open', () => {
        console.log('[HMR] Connected')
    })

    ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'reload') {
            console.log('[HMR] Reloading page...')
            window.location.reload()
        }
    })

    ws.addEventListener('close', () => {
        console.log('[HMR] Connection lost. Reconnecting...')
        setTimeout(connect, 1000)
    })

    ws.addEventListener('error', () => {
        console.log('[HMR] Connection error. Reconnecting...')
        ws.close()
    })
}

connect()
