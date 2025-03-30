
import { useEffect, useRef, useState } from 'react';

const useWebSocket = (url) => {
    const [messages, setMessages] = useState([]);
    const socketRef = useRef(null);

    useEffect(() => {
        socketRef.current = new WebSocket(url);

        socketRef.current.onmessage = (event) => {
            setMessages((prevMessages) => [...prevMessages, event.data]);
        };

        socketRef.current.onclose = () => {
            console.log('WebSocket connection closed');
        };

        return () => {
            socketRef.current.close();
        };
    }, [url]);

    return messages;
};

export default useWebSocket;
