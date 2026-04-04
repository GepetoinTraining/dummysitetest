import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";

import { ColorSchemeScript, MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import { mantineSpacing } from "@/lib/utils/golden";

const theme = createTheme({
  primaryColor: "indigo",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  headings: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" },
  defaultRadius: "md",
  spacing: mantineSpacing,
});

export const metadata = {
  title: "StudySync",
  description: "AI-powered study coordination platform using Gemma 4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <Notifications position="top-right" />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
