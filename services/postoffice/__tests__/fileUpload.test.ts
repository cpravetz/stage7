import request from 'supertest';
import express from 'express';
import { FileUploadService } from '../src/fileUploadService';
import fs from 'fs/promises';
import path from 'path';

describe('FileUploadService', () => {
  let fileUploadService: FileUploadService;
  let testStoragePath: string;

  beforeEach(() => {
    testStoragePath = path.join(__dirname, 'test-storage');
    fileUploadService = new FileUploadService(testStoragePath);
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('uploadFile', () => {
    it('should upload a file successfully', async () => {
      const testContent = 'This is a test file content';
      const fileBuffer = Buffer.from(testContent);
      const originalName = 'test.txt';
      const mimeType = 'text/plain';
      const uploadedBy = 'test-user';

      const result = await fileUploadService.uploadFile(
        fileBuffer,
        originalName,
        mimeType,
        uploadedBy
      );

      expect(result).toMatchObject({
        originalName,
        mimeType,
        size: fileBuffer.length,
        uploadedBy
      });
      expect(result.id).toBeDefined();
      expect(result.storagePath).toBeDefined();
      expect(result.uploadedAt).toBeInstanceOf(Date);

      // Verify file was actually written
      const fileExists = await fileUploadService.fileExists(result.storagePath);
      expect(fileExists).toBe(true);

      // Verify file content
      const retrievedBuffer = await fileUploadService.getFile(result.id, result.storagePath);
      expect(retrievedBuffer.toString()).toBe(testContent);
    });

    it('should reject files that are too large', async () => {
      const largeBuffer = Buffer.alloc(60 * 1024 * 1024); // 60MB
      
      await expect(
        fileUploadService.uploadFile(
          largeBuffer,
          'large.txt',
          'text/plain',
          'test-user'
        )
      ).rejects.toThrow('exceeds maximum allowed size');
    });

    it('should reject files with invalid extensions', async () => {
      const fileBuffer = Buffer.from('test content');
      
      await expect(
        fileUploadService.uploadFile(
          fileBuffer,
          'malicious.exe',
          'application/octet-stream',
          'test-user'
        )
      ).rejects.toThrow('File extension .exe is not allowed');
    });

    it('should reject files with path traversal attempts', async () => {
      const fileBuffer = Buffer.from('test content');
      
      await expect(
        fileUploadService.uploadFile(
          fileBuffer,
          '../../../etc/passwd',
          'text/plain',
          'test-user'
        )
      ).rejects.toThrow('path traversal detected');
    });
  });

  describe('deleteFile', () => {
    it('should delete a file successfully', async () => {
      const testContent = 'This is a test file content';
      const fileBuffer = Buffer.from(testContent);
      
      const uploadResult = await fileUploadService.uploadFile(
        fileBuffer,
        'test.txt',
        'text/plain',
        'test-user'
      );

      // Verify file exists
      let fileExists = await fileUploadService.fileExists(uploadResult.storagePath);
      expect(fileExists).toBe(true);

      // Delete the file
      await fileUploadService.deleteFile(uploadResult.id, uploadResult.storagePath);

      // Verify file no longer exists
      fileExists = await fileUploadService.fileExists(uploadResult.storagePath);
      expect(fileExists).toBe(false);
    });
  });

  describe('convertToMissionFile', () => {
    it('should convert UploadedFileInfo to MissionFile', () => {
      const uploadedFile = {
        id: 'test-id',
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
        storagePath: '/path/to/file',
        uploadedBy: 'test-user',
        uploadedAt: new Date(),
        description: 'Test file'
      };

      const missionFile = fileUploadService.convertToMissionFile(uploadedFile);

      expect(missionFile).toMatchObject({
        id: uploadedFile.id,
        originalName: uploadedFile.originalName,
        mimeType: uploadedFile.mimeType,
        size: uploadedFile.size,
        uploadedAt: uploadedFile.uploadedAt,
        uploadedBy: uploadedFile.uploadedBy,
        storagePath: uploadedFile.storagePath,
        description: uploadedFile.description
      });
    });
  });

  describe('file validation', () => {
    it('should accept allowed file types', async () => {
      const allowedFiles = [
        { name: 'document.pdf', mime: 'application/pdf' },
        { name: 'spreadsheet.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        { name: 'image.png', mime: 'image/png' },
        { name: 'data.json', mime: 'application/json' },
        { name: 'archive.zip', mime: 'application/zip' }
      ];

      for (const file of allowedFiles) {
        const fileBuffer = Buffer.from('test content');
        
        const result = await fileUploadService.uploadFile(
          fileBuffer,
          file.name,
          file.mime,
          'test-user'
        );

        expect(result.originalName).toBe(file.name);
        expect(result.mimeType).toBe(file.mime);
      }
    });
  });
});
