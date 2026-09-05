# my little space ♡ — iPhone/iPad sync version

This version stores calendar events and wishlist data in Firebase Firestore, with Firebase Email/Password Authentication.

## Setup
1. Create a Firebase project.
2. Add a Web App and copy its Firebase config into `firebase-config.js`.
3. Enable Authentication → Email/Password.
4. Create Firestore Database.
5. For a personal project, start with Firestore rules that allow only the signed-in user's document:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

6. Upload the whole folder to a static host (GitHub Pages, Netlify, Vercel, etc.).
7. Open the same site on iPhone and iPad and log in with the same account.

Never put passwords, service-account keys, or private API secrets in this project.
