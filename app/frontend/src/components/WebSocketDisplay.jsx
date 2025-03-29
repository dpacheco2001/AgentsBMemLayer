import React, { useState, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { connectWebSocket, disconnectWebSocket } from '../services/websocketService';

const Graph3D = () => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [highlightedNames, setHighlightedNames] = useState([]);

  // Carga inicial del grafo desde la base de datos
  useEffect(() => {
    fetch('http://localhost:5001/api/graph-data') // Ajusta la URL según tu endpoint
      .then((res) => res.json())
      .then((data) => {
        // Se espera que data tenga la estructura: { nodes: [...], links: [...] }
        setGraphData(data);
      })
      .catch((err) => console.error('Error al cargar el grafo:', err));
  }, []);

  // Conexión WebSocket para recibir los nombres de nodos a resaltar
  useEffect(() => {
    const handleMessage = (data) => {
      try {
        const parsedData = JSON.parse(data);
        // Se espera que el mensaje tenga una propiedad "highlightedNames" con un array de nombres:
        // Ejemplo: { highlightedNames: ["Nodo1", "Nodo2"] }
        if (parsedData.highlightedNames) {
          setHighlightedNames(parsedData.highlightedNames);
        }
      } catch (err) {
        console.error('Error al parsear el mensaje del WebSocket:', err);
      }
    };

    const handleConnect = () => {
      console.log('Conectado al WebSocket');
    };

    connectWebSocket('ws://localhost:6789', handleMessage, handleConnect, () => {
      console.log('Desconectado del WebSocket');
    });

    return () => {
      disconnectWebSocket();
    };
  }, []);

  const nodeColor = (node) => {
    return highlightedNames.includes(node.name) ? 'orange' : '#0074D9';
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ForceGraph3D
        graphData={graphData}
        nodeColor={nodeColor}
        linkLabel={(link) => link.label}
      />
    </div>
  );
};

export default Graph3D;
