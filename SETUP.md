# Quick Setup Checklist

Follow these steps to get the Voice Latency Profiler running:

## ✅ Pre-Setup

- [ ] Node.js 18+ installed
- [ ] npm installed
- [ ] Deepgram API key ready
- [ ] Anthropic API key ready

## ✅ Backend Setup

```bash
cd backend
npm install
```

Create `backend/.env`:
```
DEEPGRAM_API_KEY=your_deepgram_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
PORT=8080
```

Test backend:
```bash
npm run dev
```

Should see: `🚀 Starting Voice Latency Profiler Backend...`

## ✅ Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

Test frontend:
```bash
npm run dev
```

Should see: `- Local: http://localhost:3000`

## ✅ Quick Start (Windows)

Double-click `start.bat` - it will launch both servers automatically!

## ✅ Manual Start (Any OS)

Terminal 1:
```bash
cd backend && npm run dev
```

Terminal 2:
```bash
cd frontend && npm run dev
```

## ✅ Verify Installation

1. Backend health check: http://localhost:8080/health
2. Frontend: http://localhost:3000
3. Click "Start Voice Session"
4. Allow microphone access
5. Say something and watch the dashboard!

## 🔧 Troubleshooting

**Backend won't start?**
- Check API keys in `.env`
- Verify port 8080 is free
- Run `npm install` again

**Frontend won't start?**
- Check `.env.local` exists
- Verify port 3000 is free
- Clear `.next` folder and rebuild

**No microphone access?**
- Use Chrome or Edge (best support)
- Check browser permissions
- Must use localhost or HTTPS

**WebSocket connection failed?**
- Ensure backend is running first
- Check `.env.local` has correct URL
- Verify CORS is not blocking

## 🎯 Ready to Test?

1. Open http://localhost:3000
2. Click "Start Voice Session"
3. Say: "Hello, how are you today?"
4. Watch the latency metrics in real-time!
5. Try the network throttling test in DevTools

## 📊 What to Look For

- **Audio Visualizer**: Should show bars when you speak
- **Status Indicators**: Should show "You're speaking" / "Agent speaking"
- **Latency Dashboard**: Real-time metrics for each pipeline stage
- **Conversation**: Your transcript and agent response
- **Barge-in**: Interrupt the agent while it's speaking

Enjoy! 🚀
