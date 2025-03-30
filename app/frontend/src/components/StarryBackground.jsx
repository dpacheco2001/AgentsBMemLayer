
import React, { useEffect, useRef } from 'react';

const StarryBackground = () => {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    // Configurar tamaño del canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Crear estrellas
    const stars = [];
    const starCount = 400; // Increased star count for better effect
    
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.5,
        brightness: 0.2 + Math.random() * 0.8,
        blinkRate: 0.005 + Math.random() * 0.01,
        blinkDirection: Math.random() > 0.5 ? 1 : -1
      });
    }
    
    // Función para dibujar estrellas
    const drawStars = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      stars.forEach(star => {
        // Actualizar brillo para efecto de parpadeo
        star.brightness += star.blinkRate * star.blinkDirection;
        
        if (star.brightness >= 1) {
          star.brightness = 1;
          star.blinkDirection = -1;
        } else if (star.brightness <= 0.2) {
          star.brightness = 0.2;
          star.blinkDirection = 1;
        }
        
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(
          star.x, star.y, 0,
          star.x, star.y, star.radius * 2
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${star.brightness})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      
      requestAnimationFrame(drawStars);
    };
    
    // Iniciar animación
    const animationId = requestAnimationFrame(drawStars);
    
    // Limpieza al desmontar
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);
  
  return (
    <canvas 
      ref={canvasRef} 
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
    />
  );
};

export default StarryBackground;
