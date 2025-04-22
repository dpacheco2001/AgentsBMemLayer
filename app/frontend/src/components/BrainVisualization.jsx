
import React, { useEffect, useRef, useState } from 'react';

// Función para dibujar un nodo (neurona)
const drawNode = (ctx, x, y, z, isActive, highlightColor, isHovered) => {
  const depth = Math.max(0.5, (z + 200) / 400); // Normalizar profundidad para escala
  const radius = 5 * depth;
  const baseColor = '#8B5CF6';
  const scale = isActive ? 1.5 : (isHovered ? 1.2 : 1);
  const actualColor = isActive ? highlightColor : (isHovered ? '#a78bfa' : baseColor);
  
  // Guardar estado actual del contexto
  ctx.save();
  
  // Aplicar transformaciones
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  // Dibujar círculo
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = actualColor;
  
  // Agregar brillo para nodos activos o hover
  if (isActive || isHovered) {
    ctx.shadowColor = isActive ? highlightColor : '#a78bfa';
    ctx.shadowBlur = 15;
  }
  
  ctx.fill();
  
  // Agregar efecto de brillo
  if (isActive || isHovered) {
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? highlightColor : '#a78bfa';
    ctx.fill();
  }
  
  // Restaurar estado
  ctx.restore();
};

// Función para dibujar un enlace entre nodos
const drawLink = (ctx, x1, y1, z1, x2, y2, z2, isActive) => {
  const depth1 = (z1 + 200) / 400;
  const depth2 = (z2 + 200) / 400;
  
  ctx.save();
  
  // Color y opacidad basados en activación
  ctx.strokeStyle = '#D6BCFA';
  ctx.globalAlpha = isActive ? 0.8 : 0.2;
  ctx.lineWidth = isActive ? 1.5 : 0.5;
  
  // Efecto de profundidad
  const lineWidth = Math.min(depth1, depth2) * 2;
  ctx.lineWidth = isActive ? lineWidth + 0.5 : lineWidth;
  
  // Dibujar línea
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  
  ctx.restore();
};

// Componente principal de visualización
const BrainVisualizer = ({ graphData, highlightedNodes, highlightRound, onNodeSelect }) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const rotationAngleRef = useRef(0);
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [previousMousePos, setPreviousMousePos] = useState({ x: 0, y: 0 });
  const projectedNodesRef = useRef([]);
  
  // Array de colores de resaltado
  const highlightColors = ["#FFC107", "#4CAF50", "#2196F3", "#F44336", "#9C27B0"];
  const currentHighlightColor = highlightColors[highlightRound % highlightColors.length];
  
  // Función para calcular la posición de un punto en 3D a 2D
  const project3DTo2D = (x, y, z, canvasWidth, canvasHeight, angle) => {
    // Aplicar rotación en el eje Y
    const rotatedX = x * Math.cos(angle) - z * Math.sin(angle);
    const rotatedZ = x * Math.sin(angle) + z * Math.cos(angle);
    
    // Proyección simple
    const scaleFactor = 1.2;
    const projectedX = (rotatedX * scaleFactor) + canvasWidth / 2;
    const projectedY = (y * scaleFactor) + canvasHeight / 2;
    const depth = rotatedZ;
    
    return { x: projectedX, y: projectedY, z: depth };
  };
  
  // Manejador de eventos de mouse para nodos
  const handleCanvasMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Buscar si el click fue sobre algún nodo
    const clickedNode = projectedNodesRef.current.find(node => {
      const dx = node.x - mouseX;
      const dy = node.y - mouseY;
      // Distancia al cuadrado (evita calcular raíz cuadrada)
      const distSquared = dx * dx + dy * dy;
      const radius = 5 * Math.max(0.5, (node.z + 200) / 400);
      // Comparar con el radio al cuadrado
      return distSquared <= radius * radius * 4; // Un poco más grande para facilitar la selección
    });
    
    if (clickedNode) {
      if (e.detail === 1) { // Single click
        setDraggedNodeId(clickedNode.id);
        setIsDragging(true);
      } else if (e.detail === 2) { // Double click
        onNodeSelect(clickedNode.id);
      }
    } else {
      // Si se hace clic fuera de un nodo, iniciar rotación general
      setIsDragging(true);
    }
    
    setPreviousMousePos({ x: e.clientX, y: e.clientY });
  };
  
  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setMousePos({ x: mouseX, y: mouseY });
    
    // Detectar hover en nodos
    if (!isDragging) {
      const hoveredNode = projectedNodesRef.current.find(node => {
        const dx = node.x - mouseX;
        const dy = node.y - mouseY;
        const distSquared = dx * dx + dy * dy;
        const radius = 5 * Math.max(0.5, (node.z + 200) / 400);
        return distSquared <= radius * radius * 4;
      });
      
      setHoveredNodeId(hoveredNode ? hoveredNode.id : null);
    }
    
    if (isDragging) {
      const deltaX = e.clientX - previousMousePos.x;
      const deltaY = e.clientY - previousMousePos.y;
      
      if (draggedNodeId !== null) {
        // Mover nodo específico
        const nodeData = graphData.nodes.find(n => n.id === draggedNodeId);
        if (nodeData) {
          // Actualizar posición del nodo
          nodeData.x = (nodeData.x || 0) + deltaX * 0.5;
          nodeData.y = (nodeData.y || 0) + deltaY * 0.5;
        }
      } else {
        // Rotar toda la visualización
        rotationAngleRef.current += deltaX * 0.01;
      }
      
      setPreviousMousePos({ x: e.clientX, y: e.clientY });
    }
  };
  
  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setDraggedNodeId(null);
  };
  
  const handleCanvasMouseLeave = () => {
    setIsDragging(false);
    setDraggedNodeId(null);
    setHoveredNodeId(null);
  };
  
  // Efecto para inicializar posiciones aleatorias si no existen
  useEffect(() => {
    if (graphData && graphData.nodes) {
      graphData.nodes.forEach(node => {
        if (node.x === undefined) node.x = (Math.random() - 0.5) * 400;
        if (node.y === undefined) node.y = (Math.random() - 0.5) * 400;
        if (node.z === undefined) node.z = (Math.random() - 0.5) * 400;
      });
    }
  }, [graphData]);
  
  // Efecto para inicializar y animar el canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    window.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
    
    const ctx = canvas.getContext('2d');
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    
    // Configurar tamaño del canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Función para animar y renderizar
    const animate = () => {
      if (!canvas) return;
      
      // Limpiar canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Incrementar ángulo de rotación automáticamente si no hay interacción
      if (!isDragging && draggedNodeId === null) {
        rotationAngleRef.current += 0.001;
      }
      
      // Asegurarse de que hay datos para renderizar
      if (!graphData || !graphData.nodes || !graphData.links) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      
      // Calcular posiciones proyectadas para cada nodo
      const projectedNodes = graphData.nodes.map(node => {
        const pos = project3DTo2D(
          node.x || 0, 
          node.y || 0, 
          node.z || 0, 
          canvas.width, 
          canvas.height, 
          rotationAngleRef.current
        );
        
        return {
          id: node.id,
          x: pos.x,
          y: pos.y,
          z: pos.z,
          isActive: highlightedNodes.includes(node.id),
          isHovered: node.id === hoveredNodeId
        };
      });
      
      // Guardar referencia a los nodos proyectados
      projectedNodesRef.current = projectedNodes;
      
      // Ordenar nodos por profundidad (z) para una correcta superposición
      projectedNodes.sort((a, b) => a.z - b.z);
      
      // Dibujar enlaces
      graphData.links.forEach(link => {
        const sourceNode = projectedNodes.find(node => node.id === link.source);
        const targetNode = projectedNodes.find(node => node.id === link.target);
        
        if (sourceNode && targetNode) {
          const isActive = highlightedNodes.includes(link.source) && 
                          highlightedNodes.includes(link.target);
          
          drawLink(
            ctx, 
            sourceNode.x, sourceNode.y, sourceNode.z,
            targetNode.x, targetNode.y, targetNode.z,
            isActive
          );
        }
      });
      
      // Dibujar nodos
      projectedNodes.forEach(node => {
        drawNode(
          ctx, 
          node.x, 
          node.y, 
          node.z, 
          node.isActive, 
          currentHighlightColor,
          node.isHovered
        );
      });
      
      // Continuar la animación
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    // Iniciar animación
    animate();
    
    // Limpieza al desmontar
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousedown', handleCanvasMouseDown);
      canvas.removeEventListener('mousemove', handleCanvasMouseMove);
      window.removeEventListener('mouseup', handleCanvasMouseUp);
      canvas.removeEventListener('mouseleave', handleCanvasMouseLeave);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [graphData, highlightedNodes, highlightRound, currentHighlightColor, draggedNodeId, hoveredNodeId, isDragging, onNodeSelect]);
  
  // Estilo para el contenedor del canvas
  const canvasStyle = {
    width: '100%',
    height: '100%',
    background: 'transparent',
    position: 'absolute',
    top: 0,
    left: 0,
    cursor: hoveredNodeId ? 'pointer' : (isDragging ? 'grabbing' : 'grab')
  };
  
  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} style={canvasStyle} />
      
      {/* Efectos de iluminación ambiental usando divs con gradientes */}
      <div className="absolute inset-0 pointer-events-none" 
           style={{ 
             background: 'radial-gradient(circle at 30% 30%, rgba(137, 92, 246, 0.15) 0%, transparent 70%)'
           }} 
      />
      <div className="absolute inset-0 pointer-events-none" 
           style={{ 
             background: 'radial-gradient(circle at 70% 70%, rgba(214, 188, 250, 0.1) 0%, transparent 70%)'
           }} 
      />
    </div>
  );
};

export default BrainVisualizer;
