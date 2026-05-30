import React, { useState, useEffect } from 'react';

const EstadoConexion = () => {
  // Estado inicial: ¿el navegador dice que estamos online?
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Funciones que se ejecutan cuando el estado cambia
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Escuchamos los eventos del navegador
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Limpieza al desmontar el componente
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Si estamos online, no mostramos nada (es lo normal)
  // Pero puedes comentar este "if" temporalmente si quieres ver el banner siempre
  if (isOnline) {
     return null; 
  }

  // Si estamos offline, mostramos el banner de advertencia elegante
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#f39c12', // Un naranja de advertencia
      color: 'white',
      padding: '10px 20px',
      borderRadius: '20px',
      boxShadow: '0px 4px 10px rgba(0,0,0,0.3)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontWeight: 'bold',
      fontSize: '0.9rem',
      transition: 'all 0.3s ease-in-out'
    }}>
      <span>✈️</span> 
      <span>Modo Offline: Usando datos guardados</span>
    </div>
  );
};

export default EstadoConexion;