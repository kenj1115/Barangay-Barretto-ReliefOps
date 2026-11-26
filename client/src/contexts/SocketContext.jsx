import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [liveUpdates, setLiveUpdates] = useState([]);

  useEffect(() => {
    if (!user) return;

    socketRef.current = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      auth: { token: localStorage.getItem('token') },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      setConnected(true);
      if (user.role === 'admin' || user.role === 'staff') {
        socket.emit('join:staff');
      } else {
        socket.emit('join:resident', user.id);
      }
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', (err) => {
      console.error('Realtime connection failed:', err.message);
    });

    socket.on('inventory:update', (item) => {
      setLiveUpdates(prev => [
        { type: 'inventory:update', data: item, ts: Date.now() },
        ...prev.slice(0, 49),
      ]);
    });

    socket.on('inventory:low-stock', (data) => {
      setLiveUpdates(prev => [
        { type: 'inventory:low-stock', data, ts: Date.now() },
        ...prev.slice(0, 49),
      ]);
    });

    socket.on('claim:update', (claim) => {
      setLiveUpdates(prev => [
        { type: 'claim:update', data: claim, ts: Date.now() },
        ...prev.slice(0, 49),
      ]);
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, liveUpdates }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
