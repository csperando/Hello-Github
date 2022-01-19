
<link rel="preload" as="style" href="/stylesheets/landing/home.css"/>
<link rel="stylesheet" type="text/css" href="/stylesheets/landing/home.css"/>

<cfoutput>
<main>

	<h1 class="title center">Github ASCII Art</h1>

	<section>
		<div>
			<div>
				<div class="flex-wrap">
					<div class="graphic">
						<svg width="828" height="128" class="js-calendar-graph-svg">
							<g transform="translate(10, 20)">

								<!--- loop over days and create g and rect tags here --->
								<cfloop index="i" from="1" to="#totalDays+1#">
									<cfset currentDow = dow[dateFormat(day, 'ddd')]/>

									<!--- start new week group --->
									<cfif currentDow EQ 0>
										<g transform="translate(#week*16#, 0)">
									</cfif>

									<rect width="11"
										height="11"
										x="#16-week#"
										y="#currentDow*15#"
										class="ContributionCalendar-day"
										rx="2" ry="2"
										data-count="#message[currentDow+1][week+1]#"
										data-date="#day#"
										data-level="0"
										title="#day#"></rect>

									<!--- finish week group --->
									<cfif currentDow EQ 6 OR i EQ totalDays+1>
										</g>
										<cfset week = week + 1/>
									</cfif>

									<cfset day = dateFormat(day+1, 'yyyy-mm-dd')/>
								</cfloop>

								<text x="16" y="-8" class="ContributionCalendar-label">Jan</text>
								<text x="61" y="-8" class="ContributionCalendar-label">Feb</text>
								<text x="121" y="-8" class="ContributionCalendar-label">Mar</text>
								<text x="181" y="-8" class="ContributionCalendar-label">Apr</text>
								<text x="241" y="-8" class="ContributionCalendar-label">May</text>
								<text x="316" y="-8" class="ContributionCalendar-label">Jun</text>
								<text x="376" y="-8" class="ContributionCalendar-label">Jul</text>
								<text x="436" y="-8" class="ContributionCalendar-label">Aug</text>
								<text x="511" y="-8" class="ContributionCalendar-label">Sep</text>
								<text x="571" y="-8" class="ContributionCalendar-label">Oct</text>
								<text x="646" y="-8" class="ContributionCalendar-label">Nov</text>
								<text x="706" y="-8" class="ContributionCalendar-label">Dec</text>
								<text x="766" y="-8" class="ContributionCalendar-label">Jan</text>

								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="8" style="display: none;">Sun</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="25">Mon</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="32" style="display: none;">Tue</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="56">Wed</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="57" style="display: none;">Thu</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="85">Fri</text>
								<text text-anchor="start" class="ContributionCalendar-label" dx="-10" dy="81" style="display: none;">Sat</text>
							</g>
						</svg>
				  </div>
				</div>
			</div>
		</div>
	</section>

	<section>
		<h2 class="title center">How it Works</h2>
	</section>

</main>
</cfoutput>
