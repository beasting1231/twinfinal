# Firebase Setup Guide

This project uses Firebase Authentication and Firestore as the backend for user authentication and data storage.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard to create your project

## Step 2: Enable Firebase Authentication

1. In the Firebase Console, click on "Authentication" in the left sidebar
2. Click "Get started"
3. Go to the "Sign-in method" tab
4. Enable "Email/Password" provider
5. Click "Save"

## Step 3: Enable Firestore Database

1. In the Firebase Console, click on "Firestore Database" in the left sidebar
2. Click "Create database"
3. Choose "Start in test mode" for development (you can update security rules later)
4. Select a Cloud Firestore location
5. Click "Enable"

## Step 3: Get Your Firebase Configuration

1. In the Firebase Console, click the gear icon (⚙️) next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps" section
4. Click the web icon (</>) to add a web app
5. Register your app with a nickname (e.g., "Helicopter Booking")
6. Copy the Firebase configuration object

## Step 4: Configure Environment Variables

1. Copy `.env.example` to create a new `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and replace the placeholder values with your actual Firebase configuration:

```env
VITE_FIREBASE_API_KEY=your_actual_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

**Note:** The `.env` file is in `.gitignore` to prevent accidentally committing your credentials to the repository.

## Step 5: Firestore Collections Structure

The app uses three collections:

### `bookings` collection
Each document should have:
- `pilotIndex` (number): Index of the pilot (0, 1, 2, etc.)
- `timeIndex` (number): Index of the time slot (0, 1, 2, etc.)
- `customerName` (string): Customer's name
- `pickupLocation` (string): Pickup location
- `assignedPilots` (array of strings): Array of pilot names (e.g., ["Pilot 1", "Pilot 2"])
- `bookingStatus` (string): One of "confirmed", "pending", or "cancelled"
- `span` (number): Number of columns to span (1, 2, or 3)

### `unavailablePilots` collection
Each document should have:
- `pilotIndex` (number): Index of the pilot (0, 1, 2, etc.)
- `timeIndex` (number): Index of the time slot (0, 1, 2, etc.)

### `availability` collection
Each document represents a time slot when a user is available:
- `userId` (string): User ID of the person marking availability
- `date` (string): Date in YYYY-MM-DD format (e.g., "2025-11-01")
- `timeSlot` (string): Time slot (e.g., "09:00", "14:30")

**Note:** Documents are only created when a user marks themselves as available (green). When unavailable (red), the document is deleted.

## Step 6: Update Firestore Security Rules (IMPORTANT)

**Important:** By default, Firestore starts in "test mode" which allows unrestricted access. You should update the security rules to require authentication:

1. In the Firebase Console, go to "Firestore Database"
2. Click on the "Rules" tab
3. Replace the existing rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Require authentication for all operations
    match /bookings/{bookingId} {
      allow read, write: if request.auth != null;
    }
    match /unavailablePilots/{pilotId} {
      allow read, write: if request.auth != null;
    }
    match /availability/{availabilityId} {
      // Users can read all availability but only write their own
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }
  }
}
```

4. Click "Publish"

This ensures that only authenticated users can read and write data.

## Step 7: Testing Authentication

Once you've completed all the steps:

1. Run the app: `npm run dev`
2. You'll see a login/signup screen
3. Click "Need an account? Sign up" to create your first account
4. Enter your name, email, and password (minimum 6 characters)
5. Click "Sign Up"
6. You'll be automatically logged in and redirected to the app

**Note:** The first user you create will have the same access as any other user. You can manage users in the Firebase Console under Authentication → Users.

## Step 8: Testing the Full App

After logging in:

1. Switch to the "Daily Plan" view using the hamburger menu
2. The app will automatically connect to Firebase and display any bookings from the database
3. If there are no bookings, the grid will be empty (showing only "available" and "noPilot" states if configured)
4. Try logging out and logging back in to test the authentication flow

## Adding Test Data

You can add test data directly in the Firebase Console:

1. Go to Firestore Database
2. Click "Start collection"
3. Collection ID: `bookings`
4. Add a document with the fields mentioned above

Example booking document:
```json
{
  "pilotIndex": 0,
  "timeIndex": 1,
  "customerName": "John Doe",
  "pickupLocation": "Downtown Helipad",
  "assignedPilots": ["Pilot 1"],
  "bookingStatus": "confirmed",
  "span": 1
}
```

The app will automatically update in real-time when you add, modify, or delete documents!
