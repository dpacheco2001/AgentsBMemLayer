# BMEM Layer Architecture

### Made by Diego Pacheco

## Overview
This research repository demonstrates a sophisticated AI agent system with persistent memory capabilities using knowledge graphs. The project explores effective memory management techniques through a Neo4j graph database backend and a React-based visualization frontend, creating a seamless interaction between users and an AI assistant that can "dig into" its memories.

![3D Brain Visualization](./app/frontend/src/assets/images/ui.png "3D Brain Visualization")

## Research Focus Areas
- Memory persistence and retrieval strategies in conversational agents
- Dynamic behavior adaptation based on accumulated memories
- Effective memory encoding and representation techniques
- Long-term vs. short-term memory management
- Memory contextualization and relevance assessment
- Memory-augmented reasoning and decision making

## Features
- **3D Graph Visualization**: Interactive graph visualization showing memory nodes and relationships
- **Real-time Memory Exploration**: Watch as the AI agent explores its memory graph in real-time
- **WebSocket Communication**: Seamless communication between frontend and backend
- **Multi-Model Support**: Integration with multiple LLM providers (OpenAI, Anthropic, Google, etc.)
- **Neo4j Knowledge Graph**: Persistent storage of agent memories in a graph database
- **Modern UI**: Responsive design with tailored styling and smooth animations

## Technology Stack
- **Backend**: Python, Flask, WebSockets
- **Frontend**: React + Vite, TailwindCSS, Shadcn/UI, React Force Graph
- **Memory Storage**: Neo4j Graph Database
- **AI Framework**: LangGraph, LangChain
- **LLM Providers**: OpenAI, Anthropic, Google, DeepSeek, Ollama, and more

## Installation Guide

### Prerequisites
- Python 3.11.5+
- Node.js 16+
- Neo4j Database (local or cloud instance)

### Backend Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/dpacheco2001/AgentsBMemLayer.git
   cd DeepDiveAgentsMemoryLayer
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   # On Windows
   .venv\Scripts\activate
   # On macOS/Linux
   source .venv/bin/activate
   ```

3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in the root directory with the following variables:
   ```
   # Neo4j Database Connection
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=your_password

   # API Keys for different LLM providers
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   GOOGLE_API_KEY=your_google_key
   DEEPSEEK_API_KEY=your_deepseek_key
   TOGETHER_API_KEY=your_together_key

   # LangSmith for tracing and monitoring (optional)
   LANGSMITH_TRACING=true
   LANGSMITH_ENDPOINT=https://api.smith.langchain.com
   LANGSMITH_API_KEY=your_langsmith_key
   LANGSMITH_PROJECT=DeepDiveAgentsMemoryLayer
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd app/frontend
   ```

2. Install npm dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:

### Neo4j Setup
1. Install Neo4j Desktop or set up a cloud instance.
2. Create a new database with a password.
3. Update the `.env` file with your Neo4j credentials.

## Running the Application

### Start the Backend
```bash
cd app
python main_ws.py
```

### Start the Frontend
```bash
cd app/frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:8080
- Backend API: http://localhost:5001
- WebSocket: ws://localhost:6789

## Usage
1. Open http://localhost:8080 in your browser.
2. Use the chat panel to interact with the AI assistant.
3. Observe the 3D graph visualization as the AI explores its memory graph in real-time.
4. Note how the AI's memories persist between conversations, allowing for continuity in your interactions.

## Styling and Components
The frontend uses a custom styling system with:
- TailwindCSS for utility-based styling
- Shadcn/UI for accessible component primitives
- Custom "neural" theme with glowing effects and gradients

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any improvements or new features.

## License
This project is licensed under the MIT License. See the LICENSE file for details.

