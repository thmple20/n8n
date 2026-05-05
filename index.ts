import "dotenv/config";
import { Server, Socket } from "socket.io";
import { createServer } from "http";
import jwt from "jsonwebtoken";
import app from "./App";
import { socketAuthentication } from "./src/middlewares/UserAuthentication";

const port = process.env.PORT || 4007;
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
  allowUpgrades: true,
});

io.on("connection", (socket) => {
  // some additional error context
  console.log("Connection Established", socket.id);
  socket.on("join_room", (data) => {
    socket.join(data);
    console.log(`User with ID: ${socket.id} joined room: ${data}`);
  });

  socket.on("ping", (data) => {
    console.log("PingLog", data);
    socket.to(data.m_thread_id).emit("receive_message", data);
  });
});
io.engine.on("connection_error", (err: any) => {
  console.log("error=>1", err.req);
  console.log("error=>2", err.code);
  console.log("error=>3", err.message);
  console.log("error=>4", err.context);
});

server.listen(port, () => {
  console.log(`🚀 Server running on ${port}`);
});
