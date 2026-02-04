// OneDrive Integration - Replit Connector
import { Client } from '@microsoft/microsoft-graph-client';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=onedrive',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('OneDrive not connected');
  }
  return accessToken;
}

export async function getOneDriveClient() {
  const accessToken = await getAccessToken();

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

export async function createFolderIfNotExists(folderPath: string): Promise<string> {
  const client = await getOneDriveClient();
  const parts = folderPath.split('/').filter(p => p);
  
  let currentPath = '';
  let folderId = 'root';
  
  for (const part of parts) {
    const parentPath = currentPath || 'root';
    try {
      const result = await client.api(`/me/drive/${parentPath === 'root' ? 'root' : `items/${folderId}`}/children`)
        .filter(`name eq '${part}'`)
        .get();
      
      if (result.value && result.value.length > 0) {
        folderId = result.value[0].id;
      } else {
        const newFolder = await client.api(`/me/drive/${parentPath === 'root' ? 'root' : `items/${folderId}`}/children`)
          .post({
            name: part,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'rename'
          });
        folderId = newFolder.id;
      }
      currentPath = currentPath ? `${currentPath}/${part}` : part;
    } catch (error) {
      console.error(`Error creating folder ${part}:`, error);
      throw error;
    }
  }
  
  return folderId;
}

export async function createUploadSession(folderId: string, fileName: string): Promise<{ uploadUrl: string; expirationDateTime: string }> {
  const client = await getOneDriveClient();
  
  const session = await client.api(`/me/drive/items/${folderId}:/${fileName}:/createUploadSession`)
    .post({
      item: {
        '@microsoft.graph.conflictBehavior': 'rename',
        name: fileName
      }
    });
  
  return {
    uploadUrl: session.uploadUrl,
    expirationDateTime: session.expirationDateTime
  };
}

export async function getFileLink(fileId: string): Promise<string> {
  const client = await getOneDriveClient();
  
  const link = await client.api(`/me/drive/items/${fileId}/createLink`)
    .post({
      type: 'view',
      scope: 'anonymous'
    });
  
  return link.link.webUrl;
}
