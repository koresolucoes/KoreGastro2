#!/bin/bash
sed -i "s/import { Injectable, signal, computed, inject, effect } from '@angular/core';/import { Injectable, signal, computed, inject, effect } from '@angular/core';\nimport { NtpService } from '.\/ntp.service';/g" src/services/operational-auth.service.ts
