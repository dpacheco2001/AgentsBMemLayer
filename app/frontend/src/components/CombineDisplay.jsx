import React, { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { connectWebSocket, disconnectWebSocket, sendMessage } from '../services/websocketService';

const CombinedDisplay = () => {

  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const chatContainerRef = useRef(null);

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [highlightedNodes, setHighlightedNodes] = useState([]); 
  const [highlightRound, setHighlightRound] = useState(0); 


  const highlightColors = ["yellow", "green", "blue", "red", "purple"];

  useEffect(() => {
    fetch('http://localhost:5001/api/graph-data')
      .then(res => res.json())
      .then(data => setGraphData(data))
      .catch(err => console.error('Error al cargar el grafo:', err));
  }, []);


  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      console.log('Conectado al WebSocket');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      console.log('Desconectado del WebSocket');
    };

    const handleMessage = (data) => {
      try {
        const parsedData = JSON.parse(data);
        if (parsedData.AI) {
          setChatMessages(prev => [
            ...prev,
            { sender: 'ai', content: parsedData.AI, timestamp: new Date().toISOString() },
          ]);
        }


        if (parsedData.relaciones || parsedData.nodos) {
          setHighlightRound(prev => prev + 1);

          let relationPromise = Promise.resolve([]);
          if (parsedData.relaciones && Array.isArray(parsedData.relaciones) && parsedData.relaciones.length > 0) {
            relationPromise = Promise.all(
              parsedData.relaciones.map(relationType =>
                fetch(`http://localhost:5001/api/graph-data/por-relacion/${relationType}`)
                  .then(res => res.json())
                  .then(data => data.nodes.map(node => node.id))
                  .catch(err => {
                    console.error(`Error fetching for ${relationType}:`, err);
                    return [];
                  })
              )
            ).then(results => [...new Set(results.flat())]);
          }
          let nodesFromNames = [];
          if (
            parsedData.nodos &&
            Array.isArray(parsedData.nodos) &&
            graphData.nodes &&
            graphData.nodes.length > 0
          ) {
            nodesFromNames = graphData.nodes
              .filter(node => node.nombre && parsedData.nodos.includes(node.nombre))
              .map(node => node.id);
          }
          relationPromise.then(idsFromRelations => {
            const allIds = [...new Set([...idsFromRelations, ...nodesFromNames])];
            setHighlightedNodes(allIds);
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    connectWebSocket('ws://localhost:6789', handleMessage, handleConnect, handleDisconnect);
    return () => disconnectWebSocket();
  }, [graphData]); 


  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputMessage.trim() === '') return;

    setChatMessages(prev => [
      ...prev,
      { sender: 'user', content: inputMessage, timestamp: new Date().toISOString() },
    ]);
    sendMessage(inputMessage);
    setHighlightedNodes([]);
    setHighlightRound(0);

    setInputMessage('');
  };


  const renderNode = useCallback((node) => {
    const sphereGeometry = new THREE.SphereGeometry(5, 16, 16);
    const isActive = highlightedNodes.includes(node.id);
    const color = isActive ? highlightColors[highlightRound % highlightColors.length] : '#0074D9';

    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: isActive ? new THREE.Color(color) : new THREE.Color('black'),
      emissiveIntensity: isActive ? 1 : 0.2,
    });
    const sphere = new THREE.Mesh(sphereGeometry, material);
    sphere.scale.set(isActive ? 1.5 : 1, isActive ? 1.5 : 1, isActive ? 1.5 : 1);
    return sphere;
  }, [highlightedNodes, highlightRound]);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sección de Chat */}
      <div style={{ width: '400px', borderRight: '1px solid #ccc', padding: '10px' }}>
        <h2>Chat with Assistant</h2>
        <div>
          Status: {isConnected ? <span style={{ color: 'green' }}>Connected</span> : <span style={{ color: 'red' }}>Disconnected</span>}
        </div>
        <div style={{ height: '60vh', overflowY: 'auto', border: '1px solid #ccc', marginTop: '10px', padding: '10px' }} ref={chatContainerRef}>
          {chatMessages.length > 0 ? (
            chatMessages.map((msg, index) => (
              <div key={index} style={{ marginBottom: '10px', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
                <div><strong>{msg.sender === 'user' ? 'You' : 'Assistant'}:</strong></div>
                <div>{msg.content}</div>
              </div>
            ))
          ) : (
            <p>No messages yet. Start a conversation!</p>
          )}
        </div>
        <form onSubmit={handleSubmit} style={{ marginTop: '10px' }}>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your message here..."
            disabled={!isConnected}
            style={{ width: '80%', marginRight: '5px' }}
          />
          <button type="submit" disabled={!isConnected || inputMessage.trim() === ''}>Send</button>
        </form>
      </div>

      {/* Sección del Grafo 3D*/}
      <div style={{ flex: 1 }}>
        <ForceGraph3D
          graphData={graphData}
          nodeThreeObject={renderNode}
          linkLabel={(link) => link.label}
        />
      </div>
    </div>
  );
};

export default CombinedDisplay;
