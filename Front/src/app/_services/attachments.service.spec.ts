import { TestBed } from '@angular/core/testing';

import { AttachmentsService } from './attachments.service';

describe('AttachmentsService', () => {
  let service: AttachmentsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AttachmentsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
