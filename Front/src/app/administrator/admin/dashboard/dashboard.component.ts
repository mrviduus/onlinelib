import { Component } from '@angular/core';

import { AccountService } from '@app/_services';

@Component({ templateUrl: 'dashboard.component.html' })
export class DashBoardComponent {
    account = this.accountService.accountValue;

    constructor(private accountService: AccountService) { }
}