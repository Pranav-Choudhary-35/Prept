import { DM_Sans, Lora } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "500", "600", "700"],
  style: ["normal","italic"],
});

const dmSans=DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "700"],
  style: ["normal","italic"],
})


export const metadata = {
  title: "Prept",
  description: "Interview preparation platform ",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${lora.variable} ${dmSans.variable} font-sans`}
    >
      <body className="min-h-full flex flex-col">
        <main className="min-h-screen">
           <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
     </main>
      </body>
    </html>
  );
}
