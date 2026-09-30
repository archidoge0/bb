import { ProviderIcon } from "@/components/plugin/ProviderIcon";
import { Icon } from "@bb/shared-ui/icon";
import { useCallback } from "react";
import type { MarkdownProps, PluginSdkApp } from "@get-bb/plugin-sdk";
import { PluginDiff } from "@/components/plugin/PluginDiff";
import { PluginBranchPicker } from "@/components/plugin/PluginBranchPicker";
import {
  usePluginBranches,
  usePluginCheckoutState,
} from "@/components/plugin/usePluginBranchPickerState";
import { PluginNewThreadComposer } from "@/components/plugin/PluginNewThreadComposer";
import { PluginProviderModelPicker } from "@/components/plugin/PluginProviderModelPicker";
import { PluginPermissionModePicker } from "@/components/plugin/PluginPermissionModePicker";
import { PluginSourceCode } from "@/components/plugin/PluginSourceCode";
import { LazyPluginThreadChat } from "@/components/plugin/LazyPluginThreadChat";
import { PluginThreadTitle } from "@/components/plugin/PluginThreadTitle";
import { PluginUrlLink } from "@/components/plugin/PluginUrlLink";
import { ExperimentalFileLink } from "@/components/plugin/ExperimentalFileLink";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import {
  buildMarkdownDocumentLinkRouting,
  markdownDocumentFileLeaseTarget,
  parseMarkdownDocument,
} from "@/components/ui/markdown-document-link-routing";
import { useFileLeaseBaseUrl } from "@/hooks/queries/file-lease-queries";
import { useTimelineHostFileBaseUrl } from "@/components/thread/timeline/ThreadHostFileLeaseContext";
import { buildMarkdownMessageLinkRouting } from "@/components/ui/markdown-message-link-routing";
import type { MarkdownPreviewLinkHandler } from "@/components/ui/markdown-link";
import { useThreadTimelineNavigation } from "@/components/thread/timeline/ThreadTimelineNavigationContext";
import { usePluginId } from "@/components/plugin/plugin-context";
import { useQuestionFormHost } from "@bb/shared-ui/question-form-host";
import { definePluginApp } from "./plugin-app-definition";
import { installDeprecatedAliases } from "./plugin-sdk-deprecated-aliases";
import {
  useBbContext,
  useBbNavigate,
  useComposer,
  useComposers,
  useComposerView,
  useEnvironmentProviders,
  useProviders,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSdk,
  useSettings,
  experimental_useAppPanel,
  experimental_useFixedTabTarget,
} from "./plugin-sdk-hooks";
import {
  useSidebarThreadActions,
  useSidebarThreadDraft,
  useSidebarThreadDraftIds,
  useSidebarThreadPullRequest,
  useSidebarThreadRowStatus,
  useSidebarThreadRowStatuses,
  useSidebarThreadShortcut,
  useSidebarThreads,
} from "./plugin-sidebar-hooks";
import {
  useSidebarSplitLayout,
  useSidebarThreadSplit,
} from "./plugin-sidebar-split";
import {
  useSidebarNavigation,
  useSidebarNavigationSplit,
} from "./plugin-sidebar-navigation";
import { SidebarNavigationIcon } from "@/components/sidebar/SidebarNavigationModel";
import { useAppNavigationHost } from "./app-navigation-host";
import { useCodeTheme } from "./plugin-code-theme";

export const pluginSdkAppImplementation = installDeprecatedAliases(
  {
    definePluginApp,
    experimental_Icon: Icon,
    experimental_ProviderIcon: ProviderIcon,
    useBbContext,
    experimental_usePluginId: usePluginId,
    experimental_useQuestionFormHost: useQuestionFormHost,
    useBbNavigate,
    experimental_useAppPanel,
    experimental_useFixedTabTarget,
    useComposer,
    useComposers,
    useComposerView,
    useRealtime,
    useRealtimeConnectionState,
    useRpc,
    useSettings,
    ThreadChat: LazyPluginThreadChat,
    Markdown: PluginMarkdown,
    experimental_FileLink: ExperimentalFileLink,
    UrlLink: PluginUrlLink,
    experimental_NewThreadComposer: PluginNewThreadComposer,
    experimental_ProviderModelPicker: PluginProviderModelPicker,
    experimental_PermissionModePicker: PluginPermissionModePicker,
    experimental_BranchPicker: PluginBranchPicker,
    experimental_useBranches: usePluginBranches,
    experimental_useCheckoutState: usePluginCheckoutState,
    experimental_SourceCode: PluginSourceCode,
    experimental_Diff: PluginDiff,
    experimental_useSidebarThreads: useSidebarThreads,
    experimental_useSidebarThreadActions: useSidebarThreadActions,
    experimental_useSidebarThreadPullRequest: useSidebarThreadPullRequest,
    experimental_useSidebarThreadSplit: useSidebarThreadSplit,
    experimental_useSidebarNavigation: useSidebarNavigation,
    experimental_useSidebarNavigationSplit: useSidebarNavigationSplit,
    experimental_SidebarNavigationIcon: SidebarNavigationIcon,
    useSidebarThreadDraft,
    useSidebarThreadDraftIds,
    useSidebarThreadRowStatus,
    useSidebarThreadRowStatuses,
    useSidebarSplitLayout,
    useSidebarThreadShortcut,
    ThreadTitle: PluginThreadTitle,
    useEnvironmentProviders,
    useSdk,
    experimental_useProviders: useProviders,
    experimental_useCodeTheme: useCodeTheme,
  } satisfies PluginSdkApp,
  { experimental_UrlLink: "UrlLink" },
);

function PluginMarkdown({
  content,
  className,
  experimental_document,
}: MarkdownProps) {
  const timelineNavigation = useThreadTimelineNavigation();
  const onOpenLocalFileLink = timelineNavigation?.onOpenLocalFileLink;
  const threadId = timelineNavigation?.threadId;
  const workspaceRootPath = timelineNavigation?.workspaceRootPath;
  const navigation = useAppNavigationHost();
  const onOpenLink = useCallback<MarkdownPreviewLinkHandler>(
    ({ href }) => navigation.openUrl({ url: href }),
    [navigation],
  );
  const hostFileBaseUrl = useTimelineHostFileBaseUrl(threadId);
  const document = parseMarkdownDocument(experimental_document);
  const documentHostFileBaseUrl = useTimelineHostFileBaseUrl(
    document?.threadId,
  );
  const documentFileBaseUrl = useFileLeaseBaseUrl(
    document === null ? null : markdownDocumentFileLeaseTarget(document),
  );
  const messageRouting = buildMarkdownMessageLinkRouting({
    hostFileBaseUrl,
    onOpenLink,
    onOpenLocalFileLink,
    workspaceRootPath,
  }) ?? { onOpenLink };
  const linkRouting =
    experimental_document === undefined
      ? messageRouting
      : document === null
        ? {}
        : buildMarkdownDocumentLinkRouting({
            document,
            documentFileBaseUrl,
            hostFileBaseUrl: documentHostFileBaseUrl,
            messageRouting,
            openFilePreview: navigation.openFilePreview,
          });

  return (
    <MarkdownPreview
      allowHtml
      content={content}
      className={className}
      linkRouting={linkRouting}
    />
  );
}
