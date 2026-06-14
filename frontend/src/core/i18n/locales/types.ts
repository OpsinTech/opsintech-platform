import type { LucideIcon } from "lucide-react";

export interface Translations {
  // Locale meta
  locale: {
    localName: string;
  };

  // Common
  common: {
    home: string;
    settings: string;
    delete: string;
    deleteThreadConfirmTitle: string;
    deleteThreadConfirmDesc: string;
    rename: string;
    share: string;
    openInNewWindow: string;
    close: string;
    more: string;
    search: string;
    download: string;
    downloadFile: string;
    unsupportedPreview: string;
    downloadHint: string;
    thinking: string;
    thoughtFor: string;
    artifacts: string;
    public: string;
    custom: string;
    notAvailableInDemoMode: string;
    loading: string;
    version: string;
    lastUpdated: string;
    code: string;
    preview: string;
    cancel: string;
    save: string;
    install: string;
    create: string;
    export: string;
    exportAsMarkdown: string;
    exportAsJSON: string;
    exportSuccess: string;
    manage: string;
    selectAll: string;
    deselectAll: string;
    cancelSelection: string;
    batchDelete: string;
    batchDeleteConfirmTitle: string;
    batchDeleteConfirmDesc: (count: number) => string;
    selected: string;
    selectedCount: (count: number) => string;
    downloadFailed: string;
    openWindowFailed: string;
  };

  // Welcome
  welcome: {
    greeting: string;
    description: string;
    createYourOwnSkill: string;
    createYourOwnSkillDescription: string;
  };

  // Clipboard
  clipboard: {
    copyToClipboard: string;
    copiedToClipboard: string;
    failedToCopyToClipboard: string;
    linkCopied: string;
  };

  // Input Box
  inputBox: {
    placeholder: string;
    placeholderWithSkill: string;
    createSkillPrompt: string;
    addAttachments: string;
    uploadFileOrImage: string;
    skillCommandMenuPlaceholder: string;
    skillCommandMenuLoading: string;
    skillCommandMenuNoResults: string;
    mode: string;
    flashMode: string;
    flashModeDescription: string;
    reasoningMode: string;
    reasoningModeDescription: string;
    proMode: string;
    proModeDescription: string;
    ultraMode: string;
    ultraModeDescription: string;
    reasoningEffort: string;
    reasoningEffortMinimal: string;
    reasoningEffortMinimalDescription: string;
    reasoningEffortLow: string;
    reasoningEffortLowDescription: string;
    reasoningEffortMedium: string;
    reasoningEffortMediumDescription: string;
    reasoningEffortHigh: string;
    reasoningEffortHighDescription: string;
    selectModel: string;
    searchModels: string;
    followupLoading: string;
    followupConfirmTitle: string;
    followupConfirmDescription: string;
    followupConfirmAppend: string;
    followupConfirmReplace: string;
    suggestions: {
      label: string;
      skillName: string;
      prompt: string;
      icon: LucideIcon;
      description: string;
    }[];
    suggestionsCreate: (
      | {
          suggestion: string;
          prompt: string;
          icon: LucideIcon;
        }
      | {
          type: "separator";
        }
    )[];
  };

  // Sidebar
  sidebar: {
    recentChats: string;
    newChat: string;
    chats: string;
    demoChats: string;
    agents: string;
  };

  // Sidebar Navigation
  sidebarNav: {
    overview: string;
    smartWorkbench: string;
    agents: string;
    announcements: string;
    auditGovernance: string;
    systemSettings: string;
    incidents: string;
  };

  // Agents
  agents: {
    title: string;
    description: string;
    newAgent: string;
    emptyTitle: string;
    emptyDescription: string;
    chat: string;
    editLabel: string;
    delete: string;
    deleteConfirm: string;
    deleteSuccess: string;
    noDescription: string;
    newChat: string;
    createPageTitle: string;
    createPageSubtitle: string;
    nameStepTitle: string;
    nameStepHint: string;
    nameStepPlaceholder: string;
    nameStepContinue: string;
    nameStepInvalidError: string;
    nameStepAlreadyExistsError: string;
    nameStepCheckError: string;
    nameStepBootstrapMessage: string;
    agentCreated: string;
    startChatting: string;
    backToGallery: string;
    edit: {
      pageTitle: string;
      systemPromptLabel: string;
      systemPromptPlaceholder: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      modelLabel: string;
      modelDefault: string;
      skillsLabel: string;
      skillsHint: string;
      skillsCount: (count: number) => string;
      tagsLabel: string;
      tagsPlaceholder: string;
      toolGroupsLabel: string;
      toolGroupsPlaceholder: string;
      save: string;
      saving: string;
      saveSuccess: string;
      saveError: string;
    };
  };

  // Breadcrumb
  breadcrumb: {
    workspace: string;
    chats: string;
  };

  // Workspace
  workspace: {
    officialWebsite: string;
    githubTooltip: string;
    settingsAndMore: string;
    user: string;
    visitGithub: string;
    reportIssue: string;
    contactUs: string;
    about: string;
    globalSearch: string;
    manageWorkspace: string;
    unboundWorkspace: string;
  };

  // Conversation
  conversation: {
    noMessages: string;
    startConversation: string;
  };

  // Chats
  chats: {
    searchChats: string;
  };

  // Page titles (document title)
  pages: {
    appName: string;
    chats: string;
    newChat: string;
    untitled: string;
  };

  // Tool calls
  toolCalls: {
    moreSteps: (count: number) => string;
    lessSteps: string;
    executeCommand: string;
    presentFiles: string;
    needYourHelp: string;
    useTool: (toolName: string) => string;
    searchForRelatedInfo: string;
    searchForRelatedImages: string;
    searchFor: (query: string) => string;
    searchForRelatedImagesFor: (query: string) => string;
    searchOnWebFor: (query: string) => string;
    viewWebPage: string;
    listFolder: string;
    readFile: string;
    writeFile: string;
    clickToViewContent: string;
    writeTodos: string;
    skillInstallTooltip: string;
  };

  // Uploads
  uploads: {
    uploading: string;
    uploadingFiles: string;
  };

  // Subtasks
  subtasks: {
    subtask: string;
    executing: (count: number) => string;
    in_progress: string;
    completed: string;
    failed: string;
    timed_out: string;
  };

  // Token Usage
  tokenUsage: {
    title: string;
    input: string;
    output: string;
    total: string;
  };

  // Summary (conversation compression)
  summary: {
    collapsedLabel: string;
    expandedLabel: string;
  };

  // Summary Status (token usage & trigger progress)
  summaryStatus: {
    summarizations: string;
    summarizationsCount: (count: number) => string;
    triggerProgress: string;
    triggerThreshold: string;
  };

  // Nav Menu (sidebar user dropdown)
  navMenu: {
    platformGovernance: string;
    switchTenant: string;
    manageWorkspace: string;
    personalSettings: string;
    changePassword: string;
    signOut: string;
    signingOut: string;
    signOutFailed: string;
    language: string;
    expandSidebar: string;
    collapseSidebar: string;
    user: string;
    unbound: string;
  };

  // Chat Header
  chatHeader: {
    smartWorkbench: string;
    newSession: string;
    selectModel: string;
    noModel: string;
    executionRecords: string;
    executionRecordsDesc: string;
    noExecutionRecords: string;
    startNewTask: string;
    startNewTaskDesc: string;
    clickToRename: string;
    loadingThread: string;
  };

  // Message List
  messageList: {
    generatedFiles: string;
    processing: string;
    streamingThinking: string;
    streamingUsingTool: (name: string) => string;
    streamingGenerating: string;
  };

  // Attachments Panel
  attachments: {
    title: string;
    currentRoundSelectable: string;
    clearCurrentRound: string;
    onlyNewUploads: string;
    uploadHint: string;
    identifiedFiles: (count: number) => string;
    noIdentifiedFiles: string;
    collapsedSummary: (selected: number, history: number) => string;
    open: string;
    delete: string;
    deleting: string;
    deleteFailed: (filename: string) => string;
    convertedFrom: (filename: string) => string;
    renamed: (original: string, stored: string) => string;
    currentRoundReferenced: string;
    noAttachments: string;
    noReusableAttachments: string;
    historyAttachments: string;
    referencedCount: (count: number) => string;
    historyCount: (count: number) => string;
    expand: string;
    collapse: string;
  };

  // Overview
  overview: {
    title: string;
    description: string;
    mySessions: string;
    mySessionsHint: string;
    myAgents: string;
    myAgentsHint: string;
    availableModels: string;
    availableModelsHint: (total: number, enabled: number) => string;
    availableTools: string;
    availableToolsHint: (total: number, enabled: number) => string;
    availableSkills: string;
    availableSkillsHint: (total: number, enabled: number) => string;
    currentResourceStatus: string;
    resourceSummary: string;
    currentTenant: string;
    currentRole: string;
    recordedFacts: string;
    resourceCount: string;
    quickLinks: string;
    quickLinksDesc: string;
    recentSessions: string;
    viewAll: string;
    noSessions: string;
    capabilityPortal: string;
    noGovernanceData: string;
    globalSearch: string;
    switchTenantLabel: string;
    quickActions: {
      newChat: string;
      myAgents: string;
      memorySettings: string;
      resourceConfig: string;
    };
  };

  // Admin
  admin: {
    models: {
      title: string;
      description: string;
      createGlobalModel: string;
      searchPlaceholder: string;
      loadFailed: string;
      loading: string;
      noModels: string;
      noMatch: string;
      columns: {
        model: string;
        assignedTenants: string;
        capabilities: string;
        actions: string;
      };
      unassigned: string;
      andMore: (count: number) => string;
      capabilitiesLabels: {
        thinking: string;
        reasoningEffort: string;
        vision: string;
        text2image: string;
      };
      status: {
        enabled: string;
        disabled: string;
      };
      actions: {
        edit: string;
        assign: string;
        delete: string;
        deleting: string;
      };
      createDialog: {
        title: string;
        description: string;
        basicInfo: string;
        modelName: string;
        modelNamePlaceholder: string;
        providerTemplate: string;
        providerPlaceholder: string;
        globalModelId: string;
        globalModelIdPlaceholder: string;
        autoGenerateHint: string;
        restoreAuto: string;
        displayName: string;
        displayNamePlaceholder: string;
        modelDescription: string;
        descriptionPlaceholder: string;
        apiKey: string;
        apiKeyPlaceholder: string;
        baseUrl: string;
        baseUrlPlaceholder: string;
        maxTokens: string;
        maxTokensPlaceholder: string;
        sslVerification: string;
        testConnection: string;
        testing: string;
        test: string;
        connectionSuccess: string;
        connectionFailed: string;
        capabilities: string;
        capabilitiesTitle: string;
        thinking: string;
        reasoningEffort: string;
        vision: string;
        text2image: string;
        defaultEnabled: string;
        advancedConfig: string;
        outputVersion: string;
        outputVersionPlaceholder: string;
        cancel: string;
        creating: string;
        confirm: string;
        nameInvalidHint: string;
        nameExistsHint: string;
      };
      editDialog: {
        title: string;
        description: string;
        save: string;
        saving: string;
      };
      deleteDialog: {
        title: string;
        description: string;
        confirm: string;
        target: string;
      };
      assignDialog: {
        title: string;
        description: string;
        noTenants: string;
        assigned: string;
        selectedCount: string;
        cancel: string;
        save: string;
        saving: string;
        loading: string;
      };
      confirmDelete: string;
      cannotDeleteInUse: string;
      cannotDeleteEnabled: string;
      modelNotFound: string;
      createSuccess: string;
      createFailed: string;
      updateSuccess: string;
      updateFailed: string;
      deleteSuccess: string;
      deleteFailed: string;
      enableSuccess: string;
      disableSuccess: string;
      statusUpdateFailed: string;
      assignSuccess: (added: number, removed: number) => string;
      assignPartialSuccess: (added: number, removed: number) => string;
      assignFailed: (count: number) => string;
      assignError: string;
      assignNoChange: string;
      assignSelectModel: string;
      assignLoading: string;
      assignNotReady: string;
      validation: {
        fillRequired: string;
        nameInvalid: string;
        nameExists: string;
        maxTokensInvalid: string;
      };
    };
    nav: {
      moduleTitle: string;
      moduleDescription: string;
      overview: string;
      users: string;
      tenants: string;
      models: string;
      announcements: string;
      audit: string;
    };
    dashboard: {
      bootstrapWarning: {
        title: string;
        description: string;
        changeNow: string;
      };
      title: string;
      description: string;
      viewAuditLogs: string;
      metricCards: {
        totalUsers: string;
        totalThreads: string;
        totalFiles: string;
        storageCapacity: string;
        totalTenants: string;
        platformModelTemplates: string;
        assignedModels: string;
        newUsers7d: string;
        bootstrapAdminCount: string;
        mustChangePasswordCount: string;
      };
      activeUsers: string;
      suspendedUsers: string;
      allTimeTotal: string;
      processedUploads: string;
      diskUsage: string;
      activeTenants: string;
      globalModels: string;
      assignedToTenants: string;
      rollingWindow: string;
      minimizeAndAudit: string;
      trackSecurity: string;
      recentAuditSection: {
        title: string;
        description: string;
        viewAll: string;
        noRecords: string;
      };
    };
    users: {
      title: string;
      description: string;
      searchPlaceholder: string;
      createUser: string;
      loading: string;
      noRecords: string;
      loadError: string;
      columns: {
        userIdName: string;
        email: string;
        role: string;
        status: string;
        actions: string;
      };
      unnamed: string;
      statusLabels: {
        active: string;
        suspended: string;
      };
      actions: {
        changePassword: string;
        suspend: string;
        activate: string;
        delete: string;
      };
      statusUpdateError: string;
      statusUpdateFail: string;
      bootstrapDeleteForbidden: string;
      createDialog: {
        title: string;
        description: string;
        emailLabel: string;
        emailPlaceholder: string;
        nameLabel: string;
        namePlaceholder: string;
        passwordLabel: string;
        passwordPlaceholder: string;
        roleLabel: string;
        roleUser: string;
        roleAdmin: string;
        mustChangePassword: string;
        cancel: string;
        submitting: string;
        confirm: string;
        createError: string;
        internalError: string;
      };
      resetPasswordDialog: {
        title: string;
        description: string;
        newPasswordLabel: string;
        newPasswordPlaceholder: string;
        mustChangePassword: string;
        cancel: string;
        submitting: string;
        confirm: string;
        resetError: string;
        resetSuccess: string;
      };
      deleteDialog: {
        title: string;
        description: string;
        warning: string;
        dataToDelete: string;
        account: string;
        sessions: string;
        files: string;
        confirmLabel: string;
        confirmPlaceholder: string;
        cancel: string;
        deleting: string;
        confirmDelete: string;
        bootstrapDeleteForbidden: string;
        confirmMismatch: string;
        deleteError: string;
        deleteSuccess: string;
        deletedSessions: string;
        deletedAccounts: string;
        deletedFiles: string;
      };
    };
    tenants: {
      title: string;
      description: string;
      createTenant: string;
      searchPlaceholder: string;
      loading: string;
      loadError: string;
      noMatch: string;
      noMatchDescription: string;
      columns: {
        nameSlug: string;
        memberCount: string;
        status: string;
        actions: string;
      };
      members: string;
      memberDetails: string;
      noMemberDetails: string;
      actions: {
        edit: string;
        restore: string;
        permanentDelete: string;
        deactivate: string;
      };
      editDialog: {
        title: string;
        description: string;
        nameLabel: string;
        namePlaceholder: string;
        slugLabel: string;
        slugPlaceholder: string;
        statusLabel: string;
        statusPlaceholder: string;
        statusActive: string;
        statusInactive: string;
        cancel: string;
        saving: string;
        save: string;
        editError: string;
        editSuccess: string;
      };
      createDialog: {
        title: string;
        description: string;
        nameLabel: string;
        namePlaceholder: string;
        slugLabel: string;
        slugPlaceholder: string;
        ownerLabel: string;
        ownerPlaceholder: string;
        reselect: string;
        select: string;
        searching: string;
        noUsers: string;
        unnamedUser: string;
        initialRole: string;
        initialRoleDescription: string;
        cancel: string;
        creating: string;
        confirm: string;
        nameRequired: string;
        ownerRequired: string;
        createError: string;
        createSuccess: string;
      };
      deleteDialog: {
        title: string;
        description: string;
        warning: string;
        impactTitle: string;
        impact1: string;
        impact2: string;
        impact3: string;
        confirmText: string;
        cancel: string;
        processing: string;
        confirmDelete: string;
        deleteError: string;
        deleteSuccess: string;
      };
      deactivateDialog: {
        title: string;
        description: string;
        confirmText: string;
        confirmSuffix: string;
        noteTitle: string;
        note1: string;
        note2: string;
        cancel: string;
        processing: string;
        confirmDeactivate: string;
        deactivateError: string;
        deactivateSuccess: string;
      };
      restoreDialog: {
        title: string;
        description: string;
        confirmText: string;
        confirmSuffix: string;
        cancel: string;
        processing: string;
        confirmRestore: string;
        restoreError: string;
        restoreSuccess: string;
      };
    };
    announcements: {
      title: string;
      description: string;
      create: string;
      filter: {
        searchPlaceholder: string;
        allStatuses: string;
        allTypes: string;
        allSeverities: string;
        reset: string;
        found: (count: number) => string;
        keyword: (keyword: string) => string;
        status: (status: string) => string;
        type: (type: string) => string;
        severity: (severity: string) => string;
      };
      loading: string;
      noAnnouncements: string;
      noMatch: string;
      noAnnouncementsHint: string;
      noMatchHint: string;
      details: string;
      collapse: string;
      edit: string;
      publish: string;
      archive: string;
      delete: string;
      creating: string;
      scopeLabels: {
        platformAll: string;
        tenantScoped: string;
        roleScoped: string;
        tenantRoleScoped: string;
      };
      listLabels: {
        type: string;
        scope: string;
        publishAt: string;
        expireAt: string;
      };
      createDialog: {
        title: string;
        description: string;
      };
      form: {
        title: string;
        content: string;
        type: string;
        severity: string;
        status: string;
        scope: string;
        targetRoles: string;
        targetRolesPlaceholder: string;
        targetTenants: string;
        noTenantsAvailable: string;
        publishAt: string;
        expireAt: string;
        pinnedUntil: string;
        cancel: string;
        submitCreate: string;
        submitUpdate: string;
        submitting: string;
      };
      detail: {
        targetRoles: string;
        targetTenants: string;
        pinnedUntil: string;
        notSet: string;
        loading: string;
        noDetails: string;
        none: string;
      };
      validation: {
        titleRequired: string;
        contentRequired: string;
        invalidDate: string;
        publishBeforeExpire: string;
        rolesRequired: string;
        tenantsRequired: string;
      };
      saveError: string;
      operationError: string;
    };
    audit: {
      title: string;
      description: string;
      columns: {
        time: string;
        severity: string;
        eventType: string;
        actor: string;
        metadata: string;
      };
      severity: {
        info: string;
        warning: string;
        error: string;
        critical: string;
      };
      loading: string;
      loadError: string;
      noRecords: string;
      systemAnonymous: string;
    };
    security: {
      title: string;
      description: string;
      cards: {
        bootstrapStatus: string;
        keyStatus: string;
      };
      fields: {
        bootstrapAdmin: string;
        mustChangePassword: string;
        yes: string;
        no: string;
        completed: string;
        needChange: string;
      };
      changePassword: {
        newPasswordPlaceholder: string;
        confirmPasswordPlaceholder: string;
        submit: string;
        submitting: string;
        successMessage: string;
        errorLength: string;
        errorMismatch: string;
        errorFailed: string;
      };
      keyStatus: {
        trustedOrigins: string;
        secretsEncryption: string;
        uploadLimit: string;
        configured: string;
        notConfigured: string;
        defaultSoftLimit: string;
      };
      signOutCard: {
        title: string;
        description: string;
        button: string;
        signingOut: string;
      };
      signOutError: string;
    };
    backoffice: {
      admin: string;
      backToWorkspace: string;
      changePassword: string;
      signOut: string;
      signingOut: string;
      expandSidebar: string;
      collapseSidebar: string;
    };
  };

  // Shortcuts
  shortcuts: {
    searchActions: string;
    noResults: string;
    actions: string;
    keyboardShortcuts: string;
    keyboardShortcutsDescription: string;
    openCommandPalette: string;
    toggleSidebar: string;
  };

  // Settings
  settings: {
    title: string;
    description: string;
    sections: {
      appearance: string;
      user: string;
      modelLifecycle: string;
      memory: string;
      tools: string;
      skills: string;
      notification: string;
      about: string;
    };
    memory: {
      title: string;
      description: string;
      empty: string;
      rawJson: string;
      markdown: {
        overview: string;
        userContext: string;
        work: string;
        personal: string;
        topOfMind: string;
        historyBackground: string;
        recentMonths: string;
        earlierContext: string;
        longTermBackground: string;
        updatedAt: string;
        facts: string;
        empty: string;
        table: {
          category: string;
          confidence: string;
          confidenceLevel: {
            veryHigh: string;
            high: string;
            normal: string;
            unknown: string;
          };
          content: string;
          source: string;
          createdAt: string;
          view: string;
        };
      };
    };
    appearance: {
      themeTitle: string;
      themeDescription: string;
      system: string;
      light: string;
      dark: string;
      systemDescription: string;
      lightDescription: string;
      darkDescription: string;
      languageTitle: string;
      languageDescription: string;
    };
    user: {
      title: string;
      description: string;
      signOut: string;
      signingOut: string;
      signOutFailed: string;
      fields: {
        name: string;
        email: string;
        role: string;
        userId: string;
      };
      currentWorkspace: string;
      switchWorkspaceHint: string;
      selectWorkspacePlaceholder: string;
    };
    modelLifecycle: {
      title: string;
      description: string;
      currentStatus: string;
      register: {
        title: string;
        description: string;
        editTitle: (name: string) => string;
        editDescription: string;
        open: string;
        cancel: string;
        confirm: string;
        submit: string;
        submitting: string;
        showAdvanced: string;
        hideAdvanced: string;
        success: string;
        failed: string;
        emptyHint: string;
        validationRequired: string;
        basicInfo: string;
        advancedConfig: string;
        advancedConfigDesc: string;
        fields: {
          provider: string;
          providerPlaceholder: string;
          name: string;
          namePlaceholder: string;
          model: string;
          modelPlaceholder: string;
          displayName: string;
          displayNamePlaceholder: string;
          description: string;
          descriptionPlaceholder: string;
          use: string;
          supportsThinking: string;
          supportsReasoningEffort: string;
          supportsVision: string;
          supportsText2Image: string;
          useResponsesApi: string;
          outputVersion: string;
          maxTokens: string;
          baseUrl: string;
          apiKey: string;
        };
        providerNote: string;
        testConnection: string;
        testing: string;
        testSuccess: string;
        testFailed: string;
      };
      status: {
        active: string;
        deprecated: string;
        retired: string;
      };
      backToList: string;
      enabled: string;
      disabled: string;
      editDisabled: string;
      tenantAdminOnly: string;
      updateTenantFailed: string;
      readOnlyHint: string;
      userHint: string;
    };
    tools: {
      title: string;
      description: string;
      registerTool: string;
      serverName: string;
      command: string;
      commandPlaceholder: string;
      args: string;
      argsPlaceholder: string;
      addArg: string;
      envVars: string;
      envFormat: string;
      noDescription: string;
      addVar: string;
      commandRequired: string;
      url: string;
      urlPlaceholder: string;
      urlRequired: string;
      save: string;
      cancel: string;
      editTool: string;
      deleteConfirm: string;
      active: string;
      disabled: string;
      edit: string;
      delete: string;
      editServer: string;
      builtIn: string;
      type: string;
      readOnly: string;
    };
    skills: {
      title: string;
      description: string;
      createSkill: string;
      emptyTitle: string;
      emptyDescription: string;
      emptyButton: string;
      readOnlyViewHint: string;
      createDisabledHint: string;
    };
    notification: {
      title: string;
      description: string;
      requestPermission: string;
      deniedHint: string;
      testButton: string;
      testTitle: string;
      testBody: string;
      notSupported: string;
      disableNotification: string;
    };
    acknowledge: {
      emptyTitle: string;
      emptyDescription: string;
    };
  };

  // Auth pages
  auth: {
    signIn: {
      welcomeBack: string;
      signInWithEmail: string;
      email: string;
      emailPlaceholder: string;
      password: string;
      passwordPlaceholder: string;
      loginButton: string;
      connecting: string;
      newUser: string;
      register: string;
      registerSuccess: string;
      registerSuccessDesc: string;
      brandTagline: string;
      feature1: string;
      feature2: string;
      feature3: string;
      errorEmptyEmail: string;
      errorInvalidEmail: string;
      errorLoginFailed: string;
      errorRetry: string;
      accountNotActive: string;
      accountNotActiveDesc: string;
      iUnderstand: string;
    };
    signUp: {
      title: string;
      description: string;
      nickname: string;
      nicknamePlaceholder: string;
      email: string;
      emailLabel: string;
      password: string;
      passwordLabel: string;
      passwordPlaceholder: string;
      registering: string;
      registerButton: string;
      hasAccount: string;
      goToLogin: string;
      errorRetry: string;
    };
    setup: {
      title: string;
      description: string;
      email: string;
      emailPlaceholder: string;
      password: string;
      passwordPlaceholder: string;
      confirmPassword: string;
      confirmPasswordPlaceholder: string;
      initializing: string;
      submitButton: string;
      errorCheckStatus: string;
      errorInvalidEmail: string;
      errorPasswordLength: string;
      errorPasswordMismatch: string;
      errorSystemStatus: string;
      errorInitFailed: string;
      errorAutoLoginFailed: string;
      errorRetry: string;
    };
    changePassword: {
      title: string;
      description: string;
      newPassword: string;
      newPasswordPlaceholder: string;
      confirmPassword: string;
      confirmPasswordPlaceholder: string;
      saving: string;
      submitButton: string;
      errorEmpty: string;
      errorMismatch: string;
      errorLength: string;
      errorChangeFailed: string;
      errorNoEmail: string;
      errorAutoLogin: string;
      errorServer: string;
    };
    selectWorkspace: {
      title: string;
      description: string;
      loading: string;
      loadFailed: string;
      entering: string;
      noWorkspaces: string;
    };
  };

  // Workspace Switcher
  workspaceSwitcher: {
    loading: string;
    loadFailed: string;
    selectWorkspace: string;
    currentWorkspace: (name: string) => string;
    currentClickToSwitch: (name: string) => string;
    switchWorkspace: string;
  };

  // User-facing announcements
  announcementsBanner: {
    title: string;
    description: string;
    loading: string;
    loadFailed: string;
    noAnnouncements: string;
    unread: string;
    ignored: string;
    markRead: string;
    ignore: string;
    expandDetails: string;
    collapseDetails: string;
    effective: string;
    expired: string;
  };

  // Clarification block
  clarification: {
    parseError: string;
    confirmTitle: string;
    customReply: string;
    customReplyPlaceholder: string;
    confirm: string;
  };

  // Agent Gallery
  agentGallery: {
    title: string;
    description: string;
    registeredAgents: string;
    modelStrategyConfigured: string;
    toolPermissionBound: string;
    recentlyRun: string;
    recent24h: (count: number) => string;
    noAgents: string;
    noAgentsHint: string;
    releaseState: string;
    permissionScope: string;
    published: string;
    needsImprovement: string;
    controlledToolDomain: string;
    basicCapabilityOnly: string;
    modelStrategyLabel: string;
    defaultStrategy: string;
    capabilityOrchestration: (count: number) => string;
  };

  // Message group (expand/collapse etc.)
  messageGroup: {
    expandAll: string;
    collapseAll: string;
    view: string;
    generating: string;
    retryInstruction: string;
  };

  // Thread Error Messages
  threadErrors: {
    rateLimited: string;
    conversationSummarized: string;
    conversationSummarizedDesc: string;
    authFailed: string;
    contentTooLong: string;
    invalidResponse: string;
    noModelSelected: string;
    modelUnavailable: string;
    networkError: string;
    quotaExceeded: string;
    serviceUnavailable: string;
    requestFailed: string;
  };

  // Tenant Admin
  tenantAdmin: {
    shell: {
      moduleTitle: string;
      moduleDescription: string;
      nav: {
        overview: string;
        members: string;
        models: string;
        tools: string;
        skills: string;
        agents: string;
        alerts: string;
        workflows: string;
        audit: string;
      };
      currentTenant: string;
      noTenants: string;
      enterWorkspace: string;
    };
    dashboard: {
      title: string;
      description: (tenantId: string, role: string) => string;
      viewAudit: string;
      members: string;
      enabledModels: string;
      enabledTools: string;
      enabledSkills: string;
      riskAlerts: string;
      recentGovernance: string;
      recentGovernanceDesc: string;
      viewAll: string;
      noAuditData: string;
      riskTitle: string;
      riskDesc: string;
      noRisks: string;
      riskSingleAdmin: string;
      riskNoModels: string;
      riskNoTools: string;
    };
    agents: {
      title: string;
      description: string;
      createTitle: string;
      editTitle: string;
      namePlaceholder: string;
      modelPlaceholder: string;
      descriptionPlaceholder: string;
      toolsPlaceholder: string;
      enabledLabel: string;
      cancel: string;
      save: string;
      saving: string;
      create: string;
      creating: string;
      listTitle: string;
      loading: string;
      empty: string;
      columns: {
        name: string;
        source: string;
        model: string;
        tools: string;
        status: string;
        createdAt: string;
        actions: string;
      };
      sourcePlatform: string;
      sourceTenant: string;
      statusEnabled: string;
      statusDisabled: string;
      edit: string;
      delete: string;
      deleting: string;
      loadError: string;
      nameRequired: string;
      createError: string;
      updateError: string;
      deleteError: string;
      createSuccess: string;
      updateSuccess: string;
      deleteSuccess: string;
    };
    alerts: {
      title: string;
      description: string;
      createTitle: string;
      editTitle: string;
      namePlaceholder: string;
      severityPlaceholder: string;
      conditionPlaceholder: string;
      enabledLabel: string;
      cancel: string;
      save: string;
      saving: string;
      create: string;
      creating: string;
      listTitle: string;
      loading: string;
      empty: string;
      columns: {
        name: string;
        severity: string;
        status: string;
        condition: string;
        createdAt: string;
        actions: string;
      };
      statusEnabled: string;
      statusDisabled: string;
      edit: string;
      delete: string;
      deleting: string;
      loadError: string;
      nameRequired: string;
      createError: string;
      updateError: string;
      deleteError: string;
      createSuccess: string;
      updateSuccess: string;
      deleteSuccess: string;
    };
    workflows: {
      title: string;
      description: string;
      createTitle: string;
      editTitle: string;
      namePlaceholder: string;
      triggerPlaceholder: string;
      stepsPlaceholder: string;
      enabledLabel: string;
      cancel: string;
      save: string;
      saving: string;
      create: string;
      creating: string;
      listTitle: string;
      loading: string;
      empty: string;
      columns: {
        name: string;
        trigger: string;
        steps: string;
        status: string;
        createdAt: string;
        actions: string;
      };
      statusEnabled: string;
      statusDisabled: string;
      edit: string;
      delete: string;
      deleting: string;
      loadError: string;
      nameRequired: string;
      createError: string;
      updateError: string;
      deleteError: string;
      createSuccess: string;
      updateSuccess: string;
      deleteSuccess: string;
    };
    models: {
      title: string;
      description: string;
      searchPlaceholder: string;
      sourceAll: string;
      sourcePlatform: string;
      sourceTenant: string;
      statusAll: string;
      statusEnabled: string;
      statusDisabled: string;
      count: (count: number) => string;
      loading: string;
      empty: string;
      emptyFiltered: string;
      columns: {
        name: string;
        providerModel: string;
        source: string;
        enabled: string;
      };
      sourceTenantShared: string;
      sourcePlatformAssigned: string;
      updateSuccess: string;
      updateError: string;
    };
    tools: {
      title: string;
      description: string;
      searchPlaceholder: string;
      sourceAll: string;
      sourceBuiltin: string;
      sourceCustom: string;
      typeAll: string;
      statusAll: string;
      statusEnabled: string;
      statusDisabled: string;
      count: (count: number) => string;
      loading: string;
      empty: string;
      emptyFiltered: string;
      columns: {
        name: string;
        type: string;
        source: string;
        status: string;
        actions: string;
      };
      sourceBuiltinLabel: string;
      sourceTenantLabel: string;
      edit: string;
      delete: string;
      deleting: string;
      register: string;
      registerTitle: string;
      editTitle: string;
      nameLabel: string;
      namePlaceholder: string;
      typeLabel: string;
      commandLabel: string;
      commandPlaceholder: string;
      argsLabel: string;
      argsPlaceholder: string;
      envLabel: string;
      envPlaceholder: string;
      urlLabel: string;
      urlPlaceholder: string;
      descriptionLabel: string;
      headersLabel: string;
      headersPlaceholder: string;
      oauthLabel: string;
      oauthPlaceholder: string;
      testConnection: string;
      testing: string;
      testSuccess: string;
      testSuccessWithCount: (count: number) => string;
      testFailed: string;
      save: string;
      saving: string;
      cancel: string;
      nameRequired: string;
      nameInvalid: string;
      nameExists: string;
      typeInvalid: string;
      commandRequired: string;
      urlRequired: string;
      urlInvalid: string;
      createSuccess: string;
      updateSuccess: string;
      deleteSuccess: string;
      deleteConfirm: string;
      jsonInvalid: (field: string) => string;
      jsonStructureError: (field: string) => string;
      kvMode: string;
      jsonMode: string;
      arrayMode: string;
      kvKeyPlaceholder: string;
      kvValuePlaceholder: string;
      kvAddRow: string;
      deleteRow: string;
      templateLabel: string;
      templatePlaceholder: string;
      healthLabel: string;
      healthConnected: string;
      healthDisconnected: string;
      healthUnknown: string;
      checkHealth: string;
      checkingHealth: string;
      toolsCount: (n: number) => string;
      noToolsFound: string;
      noDescription: string;
      inputSchema: string;
    };
    skills: {
      title: string;
      description: string;
      searchPlaceholder: string;
      statusAll: string;
      statusEnabled: string;
      statusDisabled: string;
      count: (count: number) => string;
      loading: string;
      empty: string;
      emptyFiltered: string;
      tabs: {
        builtin: string;
        custom: string;
      };
      create: string;
      createTitle: string;
      editTitle: string;
      importTitle: string;
      nameLabel: string;
      namePlaceholder: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      instructionsLabel: string;
      instructionsPlaceholder: string;
      toolsLabel: string;
      toolsPlaceholder: string;
      promptTemplateLabel: string;
      promptTemplatePlaceholder: string;
      strategyLabel: string;
      strategyPlaceholder: string;
      save: string;
      saving: string;
      cancel: string;
      import: string;
      importDesc: string;
      importFileLabel: string;
      importFileHint: string;
      nameRequired: string;
      descriptionRequired: string;
      createSuccess: string;
      updateSuccess: string;
      deleteSuccess: string;
      importSuccess: string;
      importError: string;
      fileRequired: string;
      fileInvalid: string;
      deleteConfirm: string;
      edit: string;
      delete: string;
      deleting: string;
      detailViewHint: string;
      aiGenerate: string;
      aiGeneratePlaceholder: string;
      aiGenerating: string;
      testChat: string;
      testChatPlaceholder: string;
      testChatHint: string;
    };
    settings: {
      title: string;
      description: string;
    };
    guard: {
      loading: string;
    };
    members: {
      title: string;
      description: string;
      searchPlaceholder: string;
      addMembers: string;
      addTitle: string;
      addDesc: string;
      emailLabel: string;
      emailPlaceholder: string;
      roleLabel: string;
      roleMember: string;
      roleAdmin: string;
      addButton: string;
      adding: string;
      columns: {
        name: string;
        email: string;
        role: string;
        status: string;
        joinedAt: string;
        actions: string;
      };
      statusActive: string;
      statusInactive: string;
      remove: string;
      removing: string;
      removeConfirm: string;
      changeRole: string;
      loadError: string;
      addSuccess: string;
      addError: string;
      removeSuccess: string;
      removeError: string;
      updateRoleSuccess: string;
      updateRoleError: string;
      empty: string;
      searchLoading: string;
      searchNoResults: string;
      alreadyMember: string;
      clickToAdd: string;
      invalidEmail: string;
      emailRequired: string;
      addSuccessCount: (count: number) => string;
      alreadyMembersCount: (count: number) => string;
      notFoundUsers: string;
      emailHint: string;
      roleHint: string;
      adminOnly: string;
      loading: string;
      activate: string;
      deactivate: string;
      enableSuccess: string;
      disableSuccess: string;
      updateStatusError: string;
    };
  };
}
