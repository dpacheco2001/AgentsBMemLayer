
import React, { useState, useEffect } from 'react';
import { connectWebSocket, disconnectWebSocket, sendMessage } from '../services/websocketService';
import BrainVisualizer from '../components/BrainVisualization';
import ChatInterface from '../components/ChatInterface';
import StarryBackground from '../components/StarryBackground';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';

const Index = () => {
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [highlightedNodes, setHighlightedNodes] = useState([]);
  const [highlightRound, setHighlightRound] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);

  // Fetch graph data on component mount
  useEffect(() => {
    fetch('http://localhost:5001/api/graph-data')
      .then(res => res.json())
      .then(data => {
        console.log('Graph data loaded:', data);
        setGraphData(data);
      })
      .catch(err => console.error('Error loading graph data:', err));
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      console.log('Connected to WebSocket');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket');
    };

    const handleMessage = async (data) => {
      try {
        const parsedData = JSON.parse(data);
        
        // Handle AI messages
        if (parsedData.AI) {
          setChatMessages(prev => [
            ...prev,
            { sender: 'ai', content: parsedData.AI, timestamp: new Date().toISOString() },
          ]);
        }

        // Handle node highlighting
        if (parsedData.relaciones || parsedData.nodos) {
          setHighlightRound(prev => prev + 1);

          // Array para almacenar todos los IDs de nodos a resaltar
          let allNodeIds = [];
          
          // Procesar relaciones
          if (parsedData.relaciones && Array.isArray(parsedData.relaciones) && parsedData.relaciones.length > 0) {
            // Para cada tipo de relación, hacer una petición separada
            const relationPromises = parsedData.relaciones.map(relationType => 
              fetch(`http://localhost:5001/api/graph-data/por-relacion/${relationType}`)
                .then(res => {
                  if (!res.ok) {
                    throw new Error(`Error en la petición: ${res.status}`);
                  }
                  return res.json();
                })
                .then(data => {
                  console.log(`Datos para relación ${relationType}:`, data);
                  return data.nodes.map(node => node.id);
                })
                .catch(err => {
                  console.error(`Error fetching for ${relationType}:`, err);
                  return [];
                })
            );
            
            // Esperar a que todas las peticiones se completen
            const relationResults = await Promise.all(relationPromises);
            // Unir todos los IDs de nodos de todas las relaciones
            const relationNodeIds = relationResults.flat();
            
            // Añadir estos IDs al array principal
            allNodeIds = [...allNodeIds, ...relationNodeIds];
          }
          
          // Procesar nodos por nombre
          if (
            parsedData.nodos &&
            Array.isArray(parsedData.nodos) &&
            graphData.nodes &&
            graphData.nodes.length > 0
          ) {
            const nodesByName = graphData.nodes
              .filter(node => node.nombre && parsedData.nodos.includes(node.nombre))
              .map(node => node.id);
            
            // Añadir estos IDs al array principal
            allNodeIds = [...allNodeIds, ...nodesByName];
          }
          
          // Eliminar duplicados
          const uniqueNodeIds = [...new Set(allNodeIds)];
          
          console.log('Highlighting nodes:', uniqueNodeIds);
          setHighlightedNodes(uniqueNodeIds);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    connectWebSocket('ws://localhost:6789', handleMessage, handleConnect, handleDisconnect);
    
    return () => disconnectWebSocket();
  }, [graphData]);

  // Handle chat form submission
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

  // Handle node selection
  const handleNodeSelect = (nodeId) => {
    const node = graphData.nodes.find(n => n.id === nodeId);
    setSelectedNode(node);
  };

  return (
    <div className="flex h-screen bg-brain-dark overflow-hidden relative">
      {/* Fondo estrellado */}
      <StarryBackground />
      
      {/* Chat Section */}
      <div className="w-96 p-4 flex flex-col h-full z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-semibold text-white">Brain AI Chat</h1>
          <Link to="/graph-editor">
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Database size={16} />
              <span>Graph Editor</span>
            </Button>
          </Link>
        </div>
        
        <ChatInterface
          messages={chatMessages}
          inputMessage={inputMessage}
          setInputMessage={setInputMessage}
          handleSubmit={handleSubmit}
          isConnected={isConnected}
        />
      </div>

      {/* Brain Visualization */}
      <div className="flex-1 brain-container z-10">
        <BrainVisualizer 
          graphData={graphData} 
          highlightedNodes={highlightedNodes}
          highlightRound={highlightRound}
          onNodeSelect={handleNodeSelect}
        />
        <div className="brain-overlay"></div>
        
        {/* Node Properties Panel */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bg-secondary/90 p-4 rounded-xl border border-brain-secondary backdrop-blur-lg max-w-md z-20">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium text-white">Node Properties</h3>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-white hover:text-gray-300"
              >
                ×
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {Object.entries(selectedNode).map(([key, value]) => (
                <div key={key} className="grid grid-cols-3 gap-2">
                  <span className="text-brain-light font-medium">{key}:</span>
                  <span className="text-white col-span-2 break-words">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
