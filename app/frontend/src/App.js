import React from 'react';
import WebSocketDisplay from './components/WebSocketDisplay';
import CombineDisplay from './components/CombineDisplay';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Neo4j Graph Visualizer</h1>
      </header>
      <main>
        <CombineDisplay/>
      </main>
    </div>
  );
}

export default App;