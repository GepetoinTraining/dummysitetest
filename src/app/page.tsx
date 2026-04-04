"use client";

import {
  AppShell,
  Group,
  Title,
  Tabs,
  ActionIcon,
  Badge,
  Stack,
  Text,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconSun,
  IconMoon,
  IconPlus,
  IconBell,
  IconMessageCircle,
  IconCalendar,
  IconNetwork,
} from "@tabler/icons-react";

export default function Home() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: "sm" }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Title order={3}>StudySync</Title>
            <Badge variant="light" size="sm">
              Gemma 4 E2B
            </Badge>
          </Group>
          <Group>
            <ActionIcon variant="subtle" size="lg">
              <IconBell size={20} />
            </ActionIcon>
            <ActionIcon variant="subtle" size="lg">
              <IconCalendar size={20} />
            </ActionIcon>
            <ActionIcon variant="subtle" size="lg">
              <IconNetwork size={20} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={toggleColorScheme}
            >
              {colorScheme === "dark" ? (
                <IconSun size={20} />
              ) : (
                <IconMoon size={20} />
              )}
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" fw={600} c="dimmed">
              DISCIPLINES
            </Text>
            <ActionIcon variant="subtle" size="sm">
              <IconPlus size={14} />
            </ActionIcon>
          </Group>

          <Tabs
            orientation="vertical"
            defaultValue="welcome"
            variant="pills"
          >
            <Tabs.List>
              <Tabs.Tab value="welcome">Get Started</Tabs.Tab>
            </Tabs.List>
          </Tabs>

          <Text size="sm" fw={600} c="dimmed" mt="lg">
            AI ASSISTANT
          </Text>
          <Group gap="xs" style={{ cursor: "pointer" }}>
            <IconMessageCircle size={16} />
            <Text size="sm">Chat</Text>
          </Group>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Stack align="center" justify="center" mih={400}>
          <Title order={2}>Welcome to StudySync</Title>
          <Text c="dimmed" maw={500} ta="center">
            Add your first discipline tab to begin. Your AI assistant will help
            you build a study plan, track your progress, and connect ideas
            across subjects.
          </Text>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
