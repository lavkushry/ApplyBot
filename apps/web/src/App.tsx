function App() {
  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f0f0f0',
      minHeight: '100vh'
    }}>
      <h1 style={{ color: '#333' }}>ApplyPilot - Test Page</h1>
      <p style={{ color: '#666' }}>If you can see this, React is working!</p>
      <div style={{ 
        marginTop: '20px', 
        padding: '20px', 
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h2>Dashboard Test</h2>
        <p>The application is loading correctly.</p>
        <button 
          onClick={() => alert('Button works!')}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '10px'
          }}
        >
          Test Button
        </button>
      </div>
    </div>
  )
}

export default App
