// Define the type for our pun data
export interface Pun {
  id: number;
  text: string;
  category: string;
  dateAdded: string;
}

// Export the puns data directly
export const punsData: Pun[] = [
  {
    id: 1,
    text: "Are female babas called bebos?",
    category: "Babas",
    dateAdded: "May 4, 2025",
  },
  {
    id: 2,
    text: "Marathi people have japanese food everyday the way they go to su shi everyday.",
    category: "Food",
    dateAdded: "May 4, 2025",
  },
  {
    id: 3,
    text: "My single friends are always in debt the way they're all a loan.",
    category: "Finance",
    dateAdded: "May 4, 2025",
  },
];

// Function to get a random pun
export function getRandomPun(): Pun {
  const randomIndex = Math.floor(Math.random() * punsData.length);
  return punsData[randomIndex];
}
