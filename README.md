# Helicopter Booking System

A real-time helicopter booking and scheduling application built with React, TypeScript, and Firebase.

## Features

### Authentication
- **Email/Password Login**: Secure user authentication with Firebase
- **User Sign Up**: Create new accounts with email and password
- **Session Management**: Automatic session persistence
- **Logout**: Secure logout functionality

### Daily Plan View
- **Visual Schedule Grid**: Shows all pilots and time slots for the day
- **Booking States**:
  - 🟢 **Available**: Empty cells ready for booking
  - 🔵 **Booked**: Shows customer name, pickup location, and assigned pilots
  - ⚫ **No Pilot**: Indicates when a pilot is unavailable for a specific time slot
- **Multi-Pilot Bookings**: Support for bookings requiring 2 or 3 pilots (spans multiple columns)
- **Status Indicators**:
  - 🟢 Green dot: Confirmed booking
  - 🟡 Yellow dot: Pending booking
  - 🔴 Red dot: Cancelled booking

### Availability Grid View
- **Weekly Overview**: 7-day calendar view
- **Pilot Availability Management**: Toggle availability for specific time slots
- **Visual Feedback**: Green (available) / Red (unavailable) indicators

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **Backend**: Firebase Firestore (real-time database)
- **Date Management**: date-fns

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase account

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd twin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up Firebase (see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md))

4. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

5. Add your Firebase credentials to `.env`

6. Start the development server:
   ```bash
   npm run dev
   ```

7. Open your browser to `http://localhost:5173` (or the port shown in terminal)

## Firebase Setup

For detailed Firebase setup instructions, see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)

## Project Structure

```
twin/
├── src/
│   ├── components/
│   │   ├── Auth/
│   │   │   └── Login.tsx           # Login/Signup component
│   │   ├── Header.tsx              # App header with navigation
│   │   ├── ScheduleGrid.tsx        # Daily plan grid component
│   │   ├── AvailabilityGrid.tsx    # Weekly availability view
│   │   ├── BookingAvailable.tsx    # Individual booking cell
│   │   ├── AvailabilityCell.tsx    # Individual availability cell
│   │   └── ui/                     # Radix UI components
│   ├── contexts/
│   │   └── AuthContext.tsx         # Authentication context
│   ├── firebase/
│   │   └── config.ts               # Firebase configuration
│   ├── hooks/
│   │   └── useBookings.ts          # Custom hook for Firebase data
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   ├── App.tsx                     # Main app component
│   └── main.tsx                    # App entry point
├── .env                            # Environment variables (not in repo)
├── .env.example                    # Environment variables template
├── FIREBASE_SETUP.md               # Firebase setup guide
└── package.json
```

## Data Structure

### Booking
```typescript
{
  id?: string;
  pilotIndex: number;              // 0, 1, 2 for Pilot 1, 2, 3
  timeIndex: number;               // Index of time slot
  customerName: string;            // Customer's name
  pickupLocation: string;          // Pickup location
  assignedPilots: string[];        // ["Pilot 1", "Pilot 2", ...]
  bookingStatus: "confirmed" | "pending" | "cancelled";
  span: number;                    // Number of pilots required (1-3)
}
```

### Unavailable Pilot
```typescript
{
  id?: string;
  pilotIndex: number;              // 0, 1, 2 for Pilot 1, 2, 3
  timeIndex: number;               // Index of time slot
}
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

MIT
