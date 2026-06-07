import { useState } from 'react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  
  // Hook de React Router para redireccionar

  const iniciarSesion = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError(null);

    try {
      // ⚠️ TRUCO VITAL: FastAPI requiere formato Form-Encoded, no JSON
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const respuesta = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (!respuesta.ok) {
        throw new Error('Usuario o contraseña incorrectos');
      }

      const datos = await respuesta.json();

      // 💾 GUARDAMOS EL PASE VIP EN LA BÓVEDA DEL NAVEGADOR
      localStorage.setItem('token_nilo', datos.access_token);
      localStorage.setItem('usuario_nilo', datos.usuario);

      // Redirigimos al panel de administración usando tu sistema de URL
      window.location.href = '/?admin=true';

    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#121212', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ backgroundColor: '#1e1e1e', padding: '40px', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', width: '100%', maxWidth: '400px' }}>
        
        <h2 style={{ textAlign: 'center', marginBottom: '10px', color: '#4ade80' }}>
          Nilo - Destino Mágico
        </h2>
        <p style={{ textAlign: 'center', marginBottom: '30px', color: '#aaa' }}>
          Acceso Restringido
        </p>

        {error && (
          <div style={{ backgroundColor: '#ef4444', color: 'white', padding: '10px', borderRadius: '5px', marginBottom: '20px', textAlign: 'center', fontSize: '14px' }}>
            {error}
          </div>
        )}

        <form onSubmit={iniciarSesion} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#ddd' }}>Usuario</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #333', backgroundColor: '#2a2a2a', color: 'white', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#ddd' }}>Contraseña</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #333', backgroundColor: '#2a2a2a', color: 'white', boxSizing: 'border-box' }}
            />
          </div>

          <button 
            type="submit" 
            disabled={cargando}
            style={{ width: '100%', padding: '12px', borderRadius: '5px', border: 'none', backgroundColor: cargando ? '#22c55e80' : '#22c55e', color: '#121212', fontWeight: 'bold', fontSize: '16px', cursor: cargando ? 'not-allowed' : 'pointer', marginTop: '10px' }}
          >
            {cargando ? 'Verificando...' : 'Entrar al Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}