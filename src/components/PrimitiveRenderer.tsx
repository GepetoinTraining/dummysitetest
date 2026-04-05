"use client";

import {
  AppShell,
  Stack,
  Group,
  Paper,
  Text,
  Title,
  Badge,
  Button,
  TextInput,
  Progress,
  ActionIcon,
  Tabs,
  Textarea,
  RingProgress,
  Divider,
  Box,
} from "@mantine/core";
import { IconPlus, IconSun, IconMoon, IconBell, IconCalendar, IconNetwork, IconMessageCircle } from "@tabler/icons-react";
import dynamic from "next/dynamic";

// Lazy load 3D canvas — only when a Canvas3D primitive is in the tree
const Canvas3D = dynamic(() => import("./Canvas3D"), { ssr: false });

interface PrimitiveNode {
  id: string;
  component: string;
  slot: string;
  props: Record<string, unknown>;
  style: Record<string, unknown>;
  data_source: string | null;
  on_action: Record<string, unknown> | null;
  children?: PrimitiveNode[];
}

interface ViewData {
  view: {
    name: string;
    theme: string;
  };
  tree: PrimitiveNode;
}

// Icon map
const ICONS: Record<string, React.ReactNode> = {
  plus: <IconPlus size={14} />,
  sun: <IconSun size={20} />,
  moon: <IconMoon size={20} />,
  bell: <IconBell size={20} />,
  calendar: <IconCalendar size={20} />,
  network: <IconNetwork size={20} />,
  chat: <IconMessageCircle size={16} />,
};

function renderIcon(name: string | undefined): React.ReactNode {
  if (!name) return null;
  return ICONS[name] ?? null;
}

/**
 * Recursive renderer — reads the primitive tree and outputs Mantine.
 * One switch. No abstractions. DB row → component.
 */
function RenderPrimitive({ node }: { node: PrimitiveNode }) {
  const childElements = (node.children ?? []).map((child) => (
    <RenderPrimitive key={child.id} node={child} />
  ));

  const style = node.style as React.CSSProperties;
  const p = node.props as Record<string, any>;

  switch (node.component) {
    case "AppShell": {
      const headerChildren = (node.children ?? []).filter((c) => c.slot === "header");
      const navChildren = (node.children ?? []).filter((c) => c.slot === "navbar");
      const mainChildren = (node.children ?? []).filter((c) => c.slot === "main" || c.slot === "children");

      return (
        <AppShell
          header={{ height: p.headerHeight ?? 55 }}
          navbar={{ width: p.navWidth ?? 260, breakpoint: "sm" }}
          padding={p.padding ?? "md"}
          style={style}
        >
          <AppShell.Header>
            <Group h="100%" px="md" justify="space-between">
              {headerChildren.map((c) => <RenderPrimitive key={c.id} node={c} />)}
            </Group>
          </AppShell.Header>

          <AppShell.Navbar p="md">
            <Stack gap="xs">
              {navChildren.map((c) => <RenderPrimitive key={c.id} node={c} />)}
            </Stack>
          </AppShell.Navbar>

          <AppShell.Main>
            {mainChildren.map((c) => <RenderPrimitive key={c.id} node={c} />)}
          </AppShell.Main>
        </AppShell>
      );
    }

    case "Stack":
      return (
        <Stack {...p} style={style}>
          {childElements}
        </Stack>
      );

    case "Group":
      return (
        <Group {...p} style={style}>
          {childElements}
        </Group>
      );

    case "Paper":
      return (
        <Paper {...p} style={style}>
          {childElements}
        </Paper>
      );

    case "Text":
      return (
        <Text {...p} style={style}>
          {p.children ?? ""}
        </Text>
      );

    case "Title":
      return (
        <Title {...p} style={style}>
          {p.children ?? ""}
        </Title>
      );

    case "Badge":
      return (
        <Badge {...p} style={style}>
          {p.children ?? ""}
        </Badge>
      );

    case "Button":
      return (
        <Button {...p} style={style} leftSection={renderIcon(p.icon)}>
          {p.children ?? p.label ?? ""}
        </Button>
      );

    case "ActionIcon":
      return (
        <ActionIcon {...p} style={style}>
          {renderIcon(p.icon)}
        </ActionIcon>
      );

    case "TextInput":
      return <TextInput {...p} style={style} />;

    case "Textarea":
      return <Textarea {...p} style={style} />;

    case "Progress":
      return <Progress {...p} style={style} />;

    case "RingProgress":
      return <RingProgress {...p} style={style} />;

    case "Divider":
      return <Divider {...p} style={style} />;

    case "Tabs": {
      const tabList = (node.children ?? []).filter((c) => c.component === "TabItem");
      const panels = (node.children ?? []).filter((c) => c.component !== "TabItem");

      return (
        <Tabs {...p} style={style}>
          <Tabs.List>
            {tabList.map((tab) => (
              <Tabs.Tab key={tab.id} value={tab.props.value as string ?? tab.id}>
                {tab.props.label as string ?? ""}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {panels.map((panel) => <RenderPrimitive key={panel.id} node={panel} />)}
        </Tabs>
      );
    }

    case "TabItem":
      // Handled by Tabs parent
      return null;

    case "Canvas3D":
      return <Canvas3D {...p} style={style} />;

    case "Box":
      return (
        <Box {...p} style={style}>
          {childElements}
        </Box>
      );

    default:
      // Unknown component — render as a div with children
      return (
        <div style={style} data-component={node.component}>
          {childElements}
        </div>
      );
  }
}

/**
 * Top-level renderer — fetches the view tree and renders it.
 */
export default function PrimitiveRenderer({ viewData }: { viewData: ViewData }) {
  if (!viewData?.tree) {
    return <Text c="dimmed" ta="center" mt="xl">No view loaded.</Text>;
  }

  return <RenderPrimitive node={viewData.tree} />;
}
