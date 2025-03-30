
import React, { useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";


const ChatMessage = ({ message }) => {
  const isUser = message.sender === 'user';
  
  return (
    <div className={`chat-message ${isUser ? 'user-message' : 'ai-message'}`}>
      <div className="flex items-center mb-1">
        <span className={`font-semibold ${isUser ? 'text-white' : 'text-brain-active'}`}>
          {isUser ? 'Tú' : 'AI'}
        </span>
      </div>
      <div className="text-white leading-relaxed">{message.content}</div>
    </div>
  );
};

const ChatInterface = ({ 
  messages, 
  inputMessage, 
  setInputMessage, 
  handleSubmit, 
  isConnected 
}) => {
  const chatEndRef = useRef(null);
  
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="chat-container p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">¡Chatea!</h2>
        <div className="flex items-center">
          <span className={`status-indicator ${isConnected ? 'status-connected' : 'status-disconnected'}`}></span>
          <span className="text-sm text-gray-300">{isConnected ? 'Conectado' : 'Desconectado'}</span>
        </div>
      </div>
      
      <ScrollArea className="flex-grow pr-2 h-[calc(100vh-14rem)]">
        {messages.length > 0 ? (
          <div className="flex flex-col space-y-4 py-2">
            {messages.map((msg, index) => (
              <ChatMessage key={index} message={msg} />
            ))}
            <div ref={chatEndRef} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-center font-neural">
              No hay mensajes aún. Comienza una conversación!
            </p>
          </div>
        )}
      </ScrollArea>
      
      <form onSubmit={handleSubmit} className="mt-4">
        <div className="chat-input-container flex items-center">
          <Input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Escribe aca..."
            disabled={!isConnected}
            className="chat-input bg-transparent border-none text-white placeholder:text-gray-500"
          />
          <Button 
            type="submit" 
            disabled={!isConnected || inputMessage.trim() === ''} 
            className="send-button"
            size="icon"
          >
            <Zap className="h-5 w-5" />
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;
