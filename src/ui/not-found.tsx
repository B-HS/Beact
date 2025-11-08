const NotFound = async () => {
    return {
        default: () => (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h1>404 - Page Not Found</h1>
                <p>The page you are looking for does not exist.</p>
            </div>
        ),
    }
}

export default NotFound
