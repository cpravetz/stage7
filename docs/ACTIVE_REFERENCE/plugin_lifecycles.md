 To bring the system back into alignment, the following architectural and code changes are necessary:

  1. Enhance Plugin State Management within `pluginRegistry`:

   * Objective: The pluginRegistry must accurately reflect the lifecycle state of each plugin, especially external ones.
   * Implementation:
       * Add `status` field: Modify the PluginMetadata (or equivalent data structure) stored in the pluginRegistry to include a status field
         (e.g., SOURCE_AVAILABLE, INSTANTIATED, RUNNING, ERROR, STOPPED).
       * Update Methods: Introduce methods in pluginRegistry (e.g., updatePluginStatus(pluginId: string, newStatus: PluginStatus)) to manage
         these state transitions.
       * Initial State: When a plugin manifest is first discovered or added to the pluginRegistry from a source repository, its status should
         be set to SOURCE_AVAILABLE.

  2. Optimize Plugin Discovery and Caching in `capabilitiesManager`:

   * Objective: Reduce redundant external fetches and leverage the pluginRegistry as the primary source for plugin information.
   * Implementation:
       * Cache-First `getAvailablePlugins()`: The method responsible for retrieving the list of available plugins (e.g.,
         capabilitiesManager.getAvailablePlugins()) should first query the pluginRegistry.
       * Conditional External Fetches: External calls to GitHubRepository.fetchAllPlugins() should only occur under specific, controlled
         circumstances:
           * During initial system startup.
           * When an explicit "refresh plugin list" action is triggered by an administrator.
           * If the pluginRegistry indicates that a known plugin has a newer version available in the source repository.
           * If a requested plugin is not found in the pluginRegistry.
       * Cache Invalidation/Refresh: Implement a mechanism to periodically (but not excessively) check for updates from external repositories
         or to invalidate the cache, prompting a refresh. This interval should be configurable.
       * Update `pluginRegistry`: After fetching from external sources, the pluginRegistry should be updated with the latest manifests,
         ensuring their status is correctly set (e.g., SOURCE_AVAILABLE).

  3. Refine Health Check Logic in `capabilitiesManager`:

   * Objective: Ensure health checks are only attempted on plugins that are actually running and properly configured, and provide clear
     logging.
   * Implementation:
       * Pre-Check Plugin State: Before initiating any network call for a health check, the health check routine (e.g., within
         capabilitiesManager.runHealthChecks() or a dedicated HealthCheckService) must retrieve the plugin's current status from the
         pluginRegistry.
       * Conditional Health Checks: A health check should only proceed if:
           1. The plugin's status is RUNNING.
           2. The plugin's manifest explicitly defines a healthCheckUrl.
       * Informative Logging: Update the log messages to clearly explain why a health check is being skipped:
           * If plugin.status !== 'RUNNING': "Plugin [pluginId] is external and not currently running (status: [status]). Skipping health
             check."
           * If plugin.status === 'RUNNING' but !plugin.healthCheckUrl: "Plugin [pluginId] is external and running, but has no healthCheckUrl
             configured. Skipping health check."
       * Remove Redundant `repositoryUrl` Check: The repositoryUrl is for fetching the source, not for runtime health. It should not be part of
          the health check condition.

  4. Implement Plugin Instantiation and Launch Mechanism:

   * Objective: Provide a clear process to transition external plugins from source to a runnable state.
   * Implementation:
       * New Functionality: Introduce a dedicated function or service (potentially within the Engineer service or capabilitiesManager)
         responsible for instantiateAndLaunchPlugin(pluginId: string).
       * Process: This function would:
           * Retrieve the plugin manifest from pluginRegistry (which should be in SOURCE_AVAILABLE state).
           * Perform necessary steps to prepare the plugin for execution (e.g., build a Docker image, install dependencies, set up
             environment).
           * Launch the plugin (e.g., start a Docker container, execute a script).
           * Upon successful launch, update the plugin's status in the pluginRegistry to RUNNING.
           * Ensure that the healthCheckUrl is dynamically configured or retrieved from the running plugin instance and updated in the
             pluginRegistry.

  Summary of Impact:

  These changes will:
   * Eliminate Log Spam: The repetitive "Skipping health check" messages will be replaced with more accurate, actionable information or removed
      entirely for non-running plugins.
   * Improve Efficiency: Reduce unnecessary network requests and processing by leveraging the pluginRegistry as a cache and performing external
      fetches only when needed.
   * Enhance Clarity: Provide a clearer understanding of the state and lifecycle of external plugins within the system.
   * Enable Meaningful Monitoring: Health checks will only be performed when they can actually provide valuable operational data.
