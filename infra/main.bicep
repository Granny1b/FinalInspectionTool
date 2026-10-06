// Modig Final Inspection: Static Web App (Free) + one storage account (blobs + table).
// Resource-group scope. Deploy (see README, "Deploy to Azure"):
//   az deployment group create -g <resource-group> -f infra/main.bicep

@description('Region for the storage account. Defaults to the resource group region (README suggests swedencentral).')
param location string = resourceGroup().location

@description('Region for the Static Web App and its managed Functions. SWA is offered in only a few regions.')
@allowed([
  'westeurope'
  'eastus2'
  'centralus'
  'westus2'
  'eastasia'
])
param swaLocation string = 'westeurope'

@description('Static Web App name (unique within the resource group).')
param swaName string = 'swa-modig-final-inspection'

@description('Storage account name: globally unique, 3-24 lowercase letters and digits.')
@minLength(3)
@maxLength(24)
param storageAccountName string = 'stmodigfi${uniqueString(resourceGroup().id)}'

@description('Extra origins allowed by blob CORS for browser uploads/downloads via SAS URLs, besides the deployed site. Local development uses Azurite, so none by default.')
param devOrigins string[] = []

@secure()
@description('Optional Application Insights connection string. Managed Functions log only to Application Insights, so without it API errors are not recorded anywhere. Empty: no logging.')
param appInsightsConnectionString string = ''

@description('Tags applied to every resource.')
param tags object = {
  app: 'modig-final-inspection'
}

// Must match CONTAINERS and DEVIATIONS_TABLE in shared/src/storage.ts. Not parameters on purpose:
// the code has these names compiled in, so changing them here alone would break the app.
var containerNames = [
  'templates'
  'inspections'
  'images'
  'config'
]
var deviationsTableName = 'deviations'

// ---------- Static Web App (Free) ----------
resource swa 'Microsoft.Web/staticSites@2025-03-01' = {
  name: swaName
  location: swaLocation
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // No repository link: GitHub Actions deploys prebuilt output with the deployment token.
    // Pull-request preview environments are disabled because they would get the same app settings,
    // i.e. read/write access to the PRODUCTION storage account, from a public preview URL.
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
  }
}

// ---------- Storage ----------
resource storage 'Microsoft.Storage/storageAccounts@2026-06-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    // Required: SWA managed Functions cannot use a managed identity, so the API connects with the
    // account key (connection string) and signs SAS URLs with it.
    allowSharedKeyAccess: true
    allowCrossTenantReplication: false
    defaultToOAuthAuthentication: false
    // SWA managed Functions have no VNet integration or private endpoints.
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2026-06-01' = {
  parent: storage
  name: 'default'
  properties: {
    // A safety net against accidental deletes; cheap at this data volume.
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    // The browser uploads and downloads images directly with short-lived SAS URLs issued by the API.
    // CORS only lets those cross-origin requests through; the SAS is what authorises them.
    cors: {
      corsRules: [
        {
          allowedOrigins: concat(['https://${swa.properties.defaultHostname}'], devOrigins)
          allowedMethods: [
            'GET'
            'HEAD'
            'PUT'
            'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
          exposedHeaders: [
            'ETag'
            'Content-Length'
            'Content-Type'
            'Last-Modified'
            'x-ms-*'
          ]
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2026-06-01' = [
  for name in containerNames: {
    parent: blobService
    name: name
    properties: {
      publicAccess: 'None'
    }
  }
]

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2026-06-01' = {
  parent: storage
  name: 'default'
}

resource deviationsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2026-06-01' = {
  parent: tableService
  name: deviationsTableName
}

// ---------- App settings (environment variables of the managed Functions API) ----------
// This PUT REPLACES ALL app settings of the Static Web App: a setting added in the portal is
// removed on the next deployment of this file. Declare every setting here.
// The key is read at deployment time, so after rotating key1 re-run the deployment.
resource appSettings 'Microsoft.Web/staticSites/config@2025-03-01' = {
  parent: swa
  name: 'appsettings'
  properties: union(
    {
      STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
    },
    // Set here, not with the portal's "Enable Application Insights": that setting would be
    // removed by the next deployment (see above).
    empty(appInsightsConnectionString)
      ? {}
      : { APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString }
  )
}

// ---------- Outputs (no secrets) ----------
output swaName string = swa.name
output swaUrl string = 'https://${swa.properties.defaultHostname}'
output storageAccountName string = storage.name
